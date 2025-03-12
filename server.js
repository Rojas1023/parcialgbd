require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const pdf = require("pdfkit");
const xlsx = require("xlsx"); // Importar la librería xlsx
const XLSXStyle = require("xlsx-style");


const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.get("/productos", async (req, res) => {
    const result = await pool.query("SELECT * FROM PRODUCTOS;");
    res.json(result.rows);
});

app.post("/facturas", async (req, res) => {
    const { nombre_cliente, productos } = req.body;
    const factura = await pool.query("INSERT INTO FACTURAS (Nombre_Cliente) VALUES ($1) RETURNING ID_Factura;", [nombre_cliente]);
    const id_factura = factura.rows[0].id_factura;

    for (let producto of productos) {
        const { id_producto, cantidad, valor_u } = producto;
        const valor_t = cantidad * valor_u;
        await pool.query("INSERT INTO DETALLES_FACTURA (ID_Factura, ID_Producto, Cantidad, Valor_U, Valor_T) VALUES ($1, $2, $3, $4, $5);",
            [id_factura, id_producto, cantidad, valor_u, valor_t]);

        // Actualizar stock
        await pool.query("UPDATE PRODUCTOS SET Stock = Stock - $1 WHERE ID_Producto = $2", [cantidad, id_producto]);
    }

    res.json({ id_factura });
});

app.get("/facturas/:id/pdf", async (req, res) => {
    try {
        const { id } = req.params;
        const factura = await pool.query("SELECT * FROM FACTURAS WHERE ID_Factura = $1", [id]);

        if (factura.rows.length === 0) {
            return res.status(404).send("Factura no encontrada");
        }

        const detalles = await pool.query("SELECT P.Nombre, DF.Cantidad, DF.Valor_U, DF.Valor_T FROM DETALLES_FACTURA DF JOIN PRODUCTOS P ON DF.ID_Producto = P.ID_Producto WHERE DF.ID_Factura = $1", [id]);

        res.setHeader("Content-Disposition", `attachment; filename=factura_${id}.pdf`);
        res.setHeader("Content-Type", "application/pdf");

        const doc = new pdf({ margin: 40 });
        doc.pipe(res);

        // Estilos generales
        doc.font("Helvetica-Bold").fontSize(16).text(`Factura #${id}`, { align: "center" });
        doc.moveDown();
        doc.font("Helvetica").fontSize(12).text(`Cliente: ${factura.rows[0].nombre_cliente}`);
        doc.moveDown();

        // Configuración de tabla
        const startX = 50;
        let startY = doc.y;
        const colWidths = [200, 80, 80, 100]; // Anchos de las columnas

        // Dibujar encabezado de la tabla
        doc.fillColor("#eeeeee").rect(startX, startY, colWidths.reduce((a, b) => a + b, 0), 25).fill();
        doc.fillColor("black").font("Helvetica-Bold").fontSize(10)
            .text("Producto", startX + 5, startY + 7)
            .text("Cantidad", startX + colWidths[0] + 5, startY + 7)
            .text("Valor Unitario", startX + colWidths[0] + colWidths[1] + 5, startY + 7)
            .text("Total", startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, startY + 7);

        doc.moveDown();
        startY += 25;

        // Dibujar filas de la tabla
        detalles.rows.forEach((item, index) => {
            const cantidad = Number(item.cantidad) || 0;
            const valorU = Number(item.valor_u) || 0;
            const valorT = Number(item.valor_t) || 0;

            // Alternar color de fondo para filas impares
            if (index % 2 === 0) {
                doc.fillColor("#f8f8f8").rect(startX, startY, colWidths.reduce((a, b) => a + b, 0), 25).fill();
            }

            doc.fillColor("black").font("Helvetica").fontSize(10)
                .text(item.nombre, startX + 5, startY + 7)
                .text(cantidad, startX + colWidths[0] + 5, startY + 7)
                .text(`$${valorU.toFixed(2)}`, startX + colWidths[0] + colWidths[1] + 5, startY + 7)
                .text(`$${valorT.toFixed(2)}`, startX + colWidths[0] + colWidths[1] + colWidths[2] + 5, startY + 7);

            startY += 25;
        });

        doc.moveDown(2);

        // Calcular total de la factura
        const totalFactura = detalles.rows.reduce((acc, item) => acc + (Number(item.valor_t) || 0), 0);

        doc.font("Helvetica-Bold").fontSize(12).text(`Total Factura: $${totalFactura.toFixed(2)}`, { align: "right" });

        doc.end();
    } catch (error) {
        console.error("Error al generar el PDF:", error);
        res.status(500).send("Error al generar la factura en PDF");
    }
});

////////////////////////////////////////////////
// Rutas CRUD para la tabla PRODUCTOS
//  Obtener todos los productos (GET)
app.get("/productos", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM PRODUCTOS;");
        res.json(result.rows);
    } catch (error) {
        console.error("Error al obtener productos:", error);
        res.status(500).send("Error en el servidor");
    }
});

// 🟢 Insertar un nuevo producto (POST)
app.post("/productos", async (req, res) => {
    try {
        const { nombre, valor_u, stock } = req.body;
        if (!nombre || valor_u == null || valor_u <= 0 || stock == null) {
            return res.status(400).json({ error: "Nombre, precio y stock válidos son requeridos" });
        }

        const result = await pool.query(
            "INSERT INTO PRODUCTOS (nombre, valor_u, stock) VALUES ($1, $2, $3) RETURNING *;",
            [nombre, valor_u, stock]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error al agregar producto:", error);
        res.status(500).send("Error en el servidor");
    }
});

// 🟠 Actualizar un producto (PUT)
app.put("/productos/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, valor_u, stock } = req.body;

        if (!nombre || valor_u == null || valor_u <= 0 || stock == null) {
            return res.status(400).json({ error: "Nombre, precio y stock válidos son requeridos" });
        }

        const result = await pool.query(
            "UPDATE PRODUCTOS SET nombre = $1, valor_u = $2, stock = $3 WHERE id_producto = $4 RETURNING *;",
            [nombre, valor_u, stock, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error al actualizar producto:", error);
        res.status(500).send("Error en el servidor");
    }
});

//  Eliminar un producto (DELETE)
app.delete("/productos/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM detalles_factura WHERE id_producto = $1", [id]);
        await pool.query("DELETE FROM productos WHERE id_producto = $1", [id]);
        res.json({ message: "Producto eliminado correctamente." });
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ error: "No se pudo eliminar el producto." });
    }
});

// Nueva ruta para generar el reporte en Excel de detalles_factura
app.get("/reportes/detalles_factura", async (req, res) => {
    try {
        const { nombre_producto } = req.query;

        let query = `
            SELECT 
                DF.id_detalle,
                F.id_factura,
                P.id_producto,
                P.nombre AS nombre_producto,
                F.nombre_cliente,
                DF.cantidad,
                DF.valor_u,
                DF.valor_t,
                F.fecha
            FROM detalles_factura DF
            JOIN facturas F ON DF.id_factura = F.id_factura
            JOIN productos P ON DF.id_producto = P.id_producto
        `;

        const queryParams = [];
        if (nombre_producto) {
            query += ` WHERE P.nombre = $1`;
            queryParams.push(nombre_producto);
        }

        const result = await pool.query(query, queryParams);
        const data = result.rows;

        const workbook = xlsx.utils.book_new();
        const headers = [
            "ID Detalle",
            "ID Factura",
            "ID Producto",
            "Nombre Producto",
            "Cliente",
            "Cantidad",
            "Valor U.",
            "Valor T.",
            "Fecha"
        ];

        const worksheet = xlsx.utils.aoa_to_sheet([headers]);

        xlsx.utils.sheet_add_json(worksheet, data, { header: Object.keys(data[0]), skipHeader: true, origin: "A2" });

        // **Función para calcular el ancho mínimo necesario**
        const getMinWidth = (colName, minWidth = 8, maxWidth = 15) => {
            return Math.min(
                Math.max(colName.length, ...data.map(row => (row[colName] ? row[colName].toString().length : 0)), minWidth),
                maxWidth
            );
        };

        // Ajustar todas las columnas automáticamente, EXCEPTO las columnas ID Detalle, ID Factura y ID Producto
        const colWidths = headers.map((header, index) => {
            const key = Object.keys(data[0])[index];

            // Asegurar que las columnas ID Detalle, ID Factura e ID Producto tengan más espacio
            if (["id_detalle", "id_factura", "id_producto"].includes(key)) {
                return { wch: 20 }; // Ajustar estas columnas a un tamaño mayor
            }

            return { wch: getMinWidth(key) };
        });

        worksheet["!cols"] = colWidths;

        // Agregar filtro en la tabla
        worksheet["!autofilter"] = { ref: "A1:I" + (data.length + 1) };

        // **ESTILOS**
        const headerStyle = {
            fill: { fgColor: { rgb: "4F81BD" } },
            font: { bold: true, color: { rgb: "FFFFFF" } },
            alignment: { horizontal: "center", vertical: "center" }
        };

        const evenRowStyle = {
            fill: { fgColor: { rgb: "F2F2F2" } },
            alignment: { horizontal: "center", vertical: "center" }
        };

        const oddRowStyle = {
            fill: { fgColor: { rgb: "E6E6E6" } },
            alignment: { horizontal: "center", vertical: "center" }
        };

        // Aplicar estilos al encabezado
        headers.forEach((_, colIndex) => {
            const cellAddress = `${String.fromCharCode(65 + colIndex)}1`;
            if (worksheet[cellAddress]) {
                worksheet[cellAddress].s = headerStyle;
            }
        });

        // Aplicar estilos a las filas y corregir formato de números
        data.forEach((row, index) => {
            const rowIndex = index + 2;
            const rowStyle = index % 2 === 0 ? evenRowStyle : oddRowStyle;

            Object.keys(row).forEach((key, colIndex) => {
                const cellAddress = `${String.fromCharCode(65 + colIndex)}${rowIndex}`;
                if (!worksheet[cellAddress]) return;

                worksheet[cellAddress].s = rowStyle;

                // Quitar alerta de número como texto en columnas numéricas
                if (["id_detalle", "id_factura", "id_producto", "cantidad", "valor_u", "valor_t"].includes(key)) {
                    worksheet[cellAddress].z = "0";
                    worksheet[cellAddress].t = "n";
                }
            });
        });

        xlsx.utils.book_append_sheet(workbook, worksheet, "Detalles Factura");

        const excelBuffer = XLSXStyle.write(workbook, { bookType: "xlsx", type: "buffer" });

        res.setHeader("Content-Disposition", "attachment; filename=detalles_factura_reporte.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        res.send(excelBuffer);
    } catch (error) {
        console.error("Error al generar el reporte en Excel:", error);
        res.status(500).send("Error al generar el reporte en Excel");
    }
});

app.listen(port, () => console.log(` Servidor en http://localhost:${port}`));