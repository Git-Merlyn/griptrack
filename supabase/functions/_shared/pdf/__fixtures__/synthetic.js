// Synthetic pdf.js text items for parser tests (WP26 Phase 2, 9.10 part A).
// Invented suppliers and gear: never put text from a real customer PDF here
// (the repo is public). Each page is an array of { str, transform } items;
// transform[4] is x and transform[5] is y (pdf.js units, origin bottom-left).

const at = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });

/** A coded rental list: code column, description, quantity at the right. */
export const codedList = [
  [
    at("NORTHWIND GRIP & LIGHTING", 40, 760),
    at("Rental Agreement 55120", 40, 744),
    at("Ship Date: 11/03/2026", 40, 720),
    at("Return Date: 11/10/2026", 300, 720),
    at("Code", 40, 690),
    at("Description", 120, 690),
    at("Qty", 500, 690),
    at("GRP1001", 40, 670),
    at("Apple Box Full", 120, 670),
    at("4", 500, 670),
    at("GRP1002", 40, 655),
    at("Sandbag 25lb", 120, 655),
    at("10", 500, 655),
    // A kit with an indented sub-item that must not import on its own.
    at("LTE2001", 40, 640),
    at("Tungsten Kit 650W", 120, 640),
    at("1", 500, 640),
    at("LTE2002", 60, 625),
    at("Spare Lamp 650W", 140, 625),
    at("2", 500, 625),
    // Quantity right after the code.
    at("ELC3001", 40, 610),
    at("12", 120, 610),
    at("Stinger 25ft", 150, 610),
    at("GRP1003", 40, 595),
    at("Combo Stand - Steel", 120, 595),
    at("6", 500, 595),
    at("Total items: 33", 40, 560),
  ],
  [
    at("NORTHWIND GRIP & LIGHTING", 40, 760),
    at("GRP1004", 40, 700),
    at("Furniture Pad", 120, 700),
    at("20", 500, 700),
    at("Page 2 of 2", 260, 40),
  ],
];

/** A list without codes: category headings and "qty description" lines. */
export const codelessList = [
  [
    at("HARBOUR FILM SUPPLY", 40, 760),
    at("Out Date: 2026-11-03", 40, 740),
    at("Due Date: 2026-11-12", 300, 740),
    at("GRIP", 40, 700),
    at("2 Baby Stand", 40, 685),
    at("4 x Apple Box Half", 40, 670),
    at("ELECTRIC", 40, 640),
    at("12 Stinger 25ft", 40, 625),
    at("TOTAL 18", 40, 600),
  ],
];

/** An image-only scan: no text at all, or a stray page number. */
export const scannedPages = [[], [at("1", 300, 20)]];

// Items with widths (pdf.js reports width per item), for templates.
const w = (str, x, y, width) => ({ str, transform: [1, 0, 0, 1, x, y], width });

/**
 * A columnar list with no item codes: "Item Description" heading made of two
 * items, a Category column, right-aligned quantities under "Qty", section
 * headings, a total line, and a second page that repeats the supplier name.
 */
export const columnList = [
  [
    w("CASCADE STUDIO RENTALS", 40, 760, 160),
    w("Out Date: 03/02/2027", 40, 740, 105),
    w("Return Date: 03/09/2027", 300, 740, 125),
    w("Item", 40, 700, 22),
    w("Description", 66, 700, 60),
    w("Category", 300, 700, 48),
    w("Qty", 480, 700, 18),
    w("Grip", 40, 680, 24),
    w("Apple Box Full", 40, 665, 75),
    w("Boxes", 300, 665, 30),
    w("4", 490, 665, 6),
    w("Sandbag 25lb", 40, 650, 70),
    w("Weights", 300, 650, 40),
    w("12", 486, 650, 11),
    w("Electric", 40, 630, 40),
    w("Stinger 25ft", 40, 615, 60),
    w("Cable", 300, 615, 28),
    w("8", 490, 615, 6),
    w("Subtotal 24", 40, 600, 60),
  ],
  [
    w("CASCADE STUDIO RENTALS", 40, 760, 160),
    w("Furniture Pad", 40, 700, 70),
    w("Blankets", 300, 700, 45),
    w("20", 486, 700, 11),
    w("Total items 44", 40, 680, 75),
    w("Thank you for renting", 40, 660, 110),
  ],
];
