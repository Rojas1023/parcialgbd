document.addEventListener("DOMContentLoaded", () => {
    cargarProductos();
    document.getElementById("productoForm").addEventListener("submit", guardarProducto);
});

async function cargarProductos() {
    try {
        const response = await fetch("/productos");
        const productos = await response.json();

        console.log("Productos recibidos:", productos);

        const listaProductos = document.getElementById("productosTabla");
        if (!listaProductos) {
            console.error("Error: Elemento 'productosTabla' no encontrado.");
            return;
        }

        listaProductos.innerHTML = "";
        productos.forEach((producto) => {
            const precio = parseFloat(producto.valor_u);
            if (isNaN(precio)) {
                console.error(`Producto con ID ${producto.id_producto} tiene un precio inválido:`, producto.valor_u);
                return;
            }

            const fila = document.createElement("tr");
            fila.innerHTML = `
                <td>${producto.id_producto}</td>
                <td>${producto.nombre}</td>
                <td>$${precio.toFixed(2)}</td>
                <td>${producto.stock}</td>
                <td>
                    <button onclick="editarProducto('${producto.id_producto}', '${producto.nombre}', ${precio}, ${producto.stock})">Editar</button>
                    <button onclick="eliminarProducto('${producto.id_producto}')">Eliminar</button>
                </td>
            `;
            listaProductos.appendChild(fila);
        });
    } catch (error) {
        console.error("Error al cargar productos:", error);
    }
}

async function guardarProducto(event) {
    event.preventDefault();

    const id = document.getElementById("productoId").value.trim();
    const nombre = document.getElementById("nombre").value.trim();
    const valor_u = document.getElementById("precio").value.trim();
    const stock = document.getElementById("stock").value.trim();

    if (!nombre || !valor_u || isNaN(valor_u) || parseFloat(valor_u) <= 0 || !stock || isNaN(stock)) {
        alert("Por favor, ingrese un nombre, precio y stock válidos.");
        return;
    }

    const producto = {
        nombre: nombre,
        valor_u: parseFloat(valor_u),
        stock: parseInt(stock)
    };

    try {
        let url = "/productos";
        let method = "POST";

        if (id) {
            url = `/productos/${id}`;
            method = "PUT";
        }

        const response = await fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(producto),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }

        console.log(`Producto ${id ? "actualizado" : "creado"}:`, producto);

        // Limpiar formulario y recargar lista
        document.getElementById("productoForm").reset();
        document.getElementById("productoId").value = "";
        cargarProductos();
    } catch (error) {
        console.error("Error al guardar producto:", error);
    }
}

function editarProducto(id, nombre, precio, stock) {
    document.getElementById("productoId").value = id;
    document.getElementById("nombre").value = nombre;
    document.getElementById("precio").value = parseFloat(precio);
    document.getElementById("stock").value = stock;
}

async function eliminarProducto(id) {
    if (!confirm("¿Seguro que deseas eliminar este producto?")) return;

    try {
        await fetch(`/productos/${id}`, { method: "DELETE" });
        console.log("Producto eliminado:", id);
        cargarProductos();
    } catch (error) {
        console.error("Error al eliminar producto:", error);
    }
}