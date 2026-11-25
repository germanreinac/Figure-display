# Figure Display

A minimal clay-white wall with recessed shelves for showing digital art toys, built with three.js. Two views to A/B test:

- **Wall** – a grid of niches in one white wall, each a soft-cornered room on the face of a turning cube, with its own display lamp. Drag (or move the mouse) to tilt it; the niche interiors swing further than the wall. Push the tilt to its limit and every cube makes a quarter turn in a wave that starts in one corner, moving each figure to the next niche. Pinch, scroll or use the Zoom button to get close to a single figure; drag to move around while zoomed.
- **Carousel** – one large niche. Swipe sideways or up and down to browse. The Transition button switches between two ways of changing figure: the whole cube turns, or the figure dissolves into particles that leave through a vent in the ceiling, then the next one gathers from a gap around the plinth.

Tapping a figure on the wall opens it in the carousel.

## Run

No build step. Serve the folder and open `index.html`:

    python3 -m http.server

## Adding artworks

Figures are placeholders generated in `makeToy()` from the `ARTWORKS` list at the top of `main.js`. Replace `makeToy()` with a model loader to show real designs. Tilt range, parallax strength, zoom limits and niche sizes are constants just below that list.
