require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const pdf = require("pdfkit");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
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

app.listen(port, () => console.log(` Servidor en http://localhost:${port}`));
