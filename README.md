# Daedalus' Labyrinth

A browser-based logic puzzle. You play as Daedalus, shaping a labyrinth one hedge at a time.

**[Play it here](https://divisbyzero.github.io/Daedalus-Labyrinth/)**

## How to play

Build a labyrinth by placing hedges along the grid lines. The finished maze must form a single continuous path connecting the two exits — no loops, no dead ends.

- **Left-click** a grid line to place or remove a hedge
- **Right-click** to remove or restore an undecided line
- The number on a dot tells you how many hedges must meet at that corner
- No square region may have exactly three hedges around it

Use Undo, Redo, and Reset freely. Show Solution is available if you get stuck.

## Puzzle options

Choose a grid size (4×4 up to 15×15) and difficulty (Normal / Hard / Very Hard) before generating a new game.

## Running locally

No build step required. Clone the repo and open `index.html` in a browser.

```
git clone https://github.com/divisbyzero/Daedalus-Labyrinth.git
cd Daedalus-Labyrinth
open index.html
```
