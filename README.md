# Piazza Beretta – Residenze a Corbetta

Landing page statica del progetto ATU 5A "Piazza Beretta" (Corbetta, MI).

- `index.html` – pagina unica (HTML + CSS + JS inline, nessuna build)
- `assets/` – render, piante e loghi estratti dalle tavole di progetto
- `3d/` – vista 3D dell'edificio (Three.js da CDN, nessuna build): `index.html`, `app.js`, `style.css`
  e `building.json`, il modello ricavato dalle piante vettoriali (tav. 04, dic. 2025): muri, porte, finestre,
  stanze per appartamento, balconi e arredi. Link diretti: `3d/#p3` (un piano), `3d/#21` (un appartamento).

## Deploy
Sito statico: Vercel lo pubblica così com'è, senza comandi di build.

## Da completare
- `EMAIL_DESTINATARIO` nello script in fondo a `index.html` per attivare il form
- Nome commerciale / logo "PB" sono segnaposto
- Verificare i riferimenti di location (linea S6, A4)
