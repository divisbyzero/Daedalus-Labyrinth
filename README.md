# Daedalus' Labyrinth

A browser-based logic puzzle. You play as Daedalus, shaping a labyrinth one hedge at a time.

It's a grid-deduction puzzle designed as the dual of [Loopy](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/js/loopy.html) from Simon Tatham's Portable Puzzle Collection (itself an implementation of Nikoli's Slitherlink): instead of tracing the loop, you plant the hedges, and the path through the labyrinth emerges as what's left.

**[Play it here](https://divisbyzero.github.io/Daedalus-Labyrinth/)**

## How to play

Build a labyrinth by placing hedges along the grid lines. The finished maze must form a single continuous path connecting the two exits — no loops, no dead ends. The two gaps in the outer border are the entrance and exit.

- **Left-click** a grid line to cycle it: undecided → hedge → removed
- **Right-click** to cycle in reverse (a long press removes a line directly)
- The number on a dot tells you exactly how many hedges meet at that corner
- Every square is either on the path (two openings) or walled off on all four sides

The puzzle completes as soon as your hedges fully bound the path — leftover undecided lines are fine. (Prefer to decide every line? Turn on Strict finish in the preferences.) Use Undo, Redo, and Reset freely. Show Solution is available if you get stuck.

## Puzzle options

Choose a grid size (4×4 up to 15×15) and difficulty (Beginner / Normal / Hard / Very Hard) before generating a new game.

## Running locally

No build step required. Clone the repo and open `index.html` in a browser.

```sh
git clone https://github.com/divisbyzero/Daedalus-Labyrinth.git
cd Daedalus-Labyrinth
open index.html
```
