document.addEventListener("DOMContentLoaded", () => {
    const clienteInput = document.getElementById("cliente");
    const tablaProductos = document.getElementById("tabla-productos").querySelector("tbody");
    const agregarProductoBtn = document.getElementById("agregar-producto");
    const generarFacturaBtn = document.getElementById("generar-factura");
    const totalCompraSpan = document.getElementById("total-compra");

    const limpiarFacturaBtn = document.getElementById("limpiar-factura");

    limpiarFacturaBtn.addEventListener("click", () => {
        clienteInput.value = ""; // Limpia el nombre del cliente
        tablaProductos.innerHTML = ""; // Limpia la tabla de productos
        totalCompra = 0; // Restablece el total de la compra
        totalCompraSpan.textContent = "$0"; // Actualiza el total en la interfaz
    });

    let totalCompra = 0;
    let productosDisponibles = [];

    async function cargarProductos() {
        const res = await fetch("/productos");
        productosDisponibles = await res.json();
    }

    function actualizarTotal() {
        totalCompra = Array.from(tablaProductos.children).reduce((acc, row) => {
            return acc + parseFloat(row.dataset.total || 0);
        }, 0);
        totalCompraSpan.textContent = `$${totalCompra.toFixed(2)}`;
    }

    function agregarFilaProducto() {
        const row = document.createElement("tr");

        const selectProducto = document.createElement("select");
        selectProducto.innerHTML = `<option value="">Seleccione...</option>` + 
            productosDisponibles.map(p => `<option value="${p.id_producto}" data-precio="${p.valor_u}" data-stock="${p.stock}">${p.nombre}</option>`).join("");

        const valorUnitario = document.createElement("td");
        const cantidadInput = document.createElement("input");
        cantidadInput.type = "number";
        cantidadInput.value = 1;
        cantidadInput.min = 1;

        const valorTotal = document.createElement("td");
        valorTotal.textContent = "$0.00";

        const botonEliminar = document.createElement("button");
        botonEliminar.textContent = "❌";
        botonEliminar.addEventListener("click", () => {
            row.remove();
            actualizarTotal();
        });

        selectProducto.addEventListener("change", (e) => {
            const precio = parseFloat(e.target.selectedOptions[0].dataset.precio || 0);
            valorUnitario.textContent = `$${precio.toFixed(2)}`;
            cantidadInput.dispatchEvent(new Event("input"));
        });

        cantidadInput.addEventListener("input", () => {
            const precio = parseFloat(selectProducto.selectedOptions[0].dataset.precio || 0);
            const cantidad = parseInt(cantidadInput.value) || 1;
            const total = precio * cantidad;
            valorTotal.textContent = `$${total.toFixed(2)}`;
            row.dataset.total = total;
            actualizarTotal();
        });

        row.appendChild(selectProducto);
        row.appendChild(valorUnitario);
        row.appendChild(cantidadInput);
        row.appendChild(valorTotal);
        row.appendChild(botonEliminar);
        tablaProductos.appendChild(row);
    }

    agregarProductoBtn.addEventListener("click", agregarFilaProducto);

    generarFacturaBtn.addEventListener("click", async () => {
        const nombreCliente = clienteInput.value.trim();
        if (!nombreCliente) return alert("Ingrese el nombre del cliente.");

        const productos = Array.from(tablaProductos.children).map(row => ({
            id_producto: row.querySelector("select").value,
            cantidad: row.querySelector("input").value,
            valor_u: parseFloat(row.querySelector("td:nth-child(2)").textContent.replace("$", "")),
            stock: parseInt(row.querySelector("select").selectedOptions[0].dataset.stock)
        }));

        for (let producto of productos) {
            if (producto.cantidad > producto.stock) {
                // Buscar el producto en productosDisponibles
                const productoCompleto = productosDisponibles.find(p => p.id_producto === producto.id_producto);
                if (productoCompleto) {
                    return alert(`No hay suficiente stock para el producto: ${productoCompleto.nombre} ID: ${producto.id_producto}.`);
                } else {
                    return alert(`No hay suficiente stock para el producto con ID: ${producto.id_producto}.`);
                }
            }
        }

        const res = await fetch("/facturas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre_cliente: nombreCliente, productos })
        });

        const data = await res.json();
        if (data.id_factura) {
            window.open(`/facturas/${data.id_factura}/pdf`, "_blank");
        }
    });

    cargarProductos();
});

