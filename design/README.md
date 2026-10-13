# Design source

`design/clean/` holds the source of the **Final** interactive prototype (bottom dock navigation, PayPal AI opening from the right).

| File | What it is |
|---|---|
| `Final.dc.html` | The frame. It mounts `ProtoClean` with the bottom dock and the PayPal AI panel (`screen="home-sidebar"`, `chat-dock="rail"`). |
| `ProtoClean.dc.html` | The whole prototype: markup at the top, and `class Component extends DCLogic` with `renderVals()` at the bottom. It holds all screens and the sample data. |
| `Icon.dc.html`, `Logo.dc.html`, `Product.dc.html` | The shared stroke-icon, merchant-logo and product-image components. |
| `canvas.json` | The canvas layout. |

The prototype runs on sample data. The Next.js app in `src/` implements the same design against the live PayPal SDK and Claude endpoints.
