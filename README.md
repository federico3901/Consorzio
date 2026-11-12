# Piazza Beretta – Residenze a Corbetta

Landing page statica del progetto ATU 5A "Piazza Beretta" (Corbetta, MI).

- `index.html` – pagina unica (HTML + CSS + JS inline, nessuna build)
- `assets/` – render, piante e loghi estratti dalle tavole di progetto
- `3d/` – vista 3D dell'edificio (Three.js da CDN, nessuna build): `index.html`, `app.js`, `style.css`
  e `building.json`, il modello ricavato dalle piante vettoriali (tav. 04, dic. 2025): muri, porte, finestre,
  stanze per appartamento, balconi e arredi. Comprende il piano interrato con box e cantine (tav. 03).
  Link diretti: `3d/#p3` (un piano), `3d/#21` (un appartamento), `3d/#pi` (interrato); aggiungi `?isolato`
  per aprirli isolati, es. `3d/?isolato#21`.

- `3d/tipo.html?u=4|25|21` – appartamenti tipo: pianta arredata (`tipi.json`) e tour 360° (`&vista=tour`).
  Il tour (`tipo-tour.js`) mostra panorami equirettangolari in `3d/tour/` (immagini + `tour.json` con stanze,
  vista iniziale e punti di passaggio), renderizzati in path tracing dall'appartamento arredato.

## Crediti
Modelli 3D, texture e cielo HDRI dei render del tour: [Poly Haven](https://polyhaven.com), licenza CC0.

## Deploy
Sito statico: Vercel lo pubblica così com'è, senza comandi di build.

## Da completare
- `EMAIL_DESTINATARIO` nello script in fondo a `index.html` per attivare il form
- Nome commerciale / logo "PB" sono segnaposto
- Verificare i riferimenti di location (linea S6, A4)
