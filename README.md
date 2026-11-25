# Figure Display

A minimal clay-white wall with recessed shelves for showing digital art toys, built with three.js. Two views to A/B test:

- **Wall** – a grid of niches cut into one wall. Drag (or move the mouse) to tilt it slightly; the niche interiors move differently from the wall. The Parallax button cycles Deep / Natural / Counter.
- **Carousel** – one niche with a revolving panel. Swiping turns it; every half-turn brings the next figure round. The Swipe button switches between sideways and up/down.

Tapping a figure on the wall opens it in the carousel.

## Run

No build step. Serve the folder and open `index.html`:

    python3 -m http.server

## Adding artworks

Figures are placeholders generated in `makeToy()` from the `ARTWORKS` list at the top of `main.js`. Replace `makeToy()` with a model loader to show real designs. Tilt range, parallax strengths and niche sizes are constants just below that list.
