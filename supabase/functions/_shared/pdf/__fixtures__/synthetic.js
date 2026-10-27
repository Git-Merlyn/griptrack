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
