GripTrack

GripTrack is a web-based inventory management system designed for film, grip, and electric departments.
It focuses on fast location-based inventory tracking, rental periods, and real-world workflows where equipment is frequently moved, split, and recombined.

The app is desktop-first for power users, with a mobile-friendly web UI for quick checks and updates on set.

⸻

✨ Key Features

Inventory Management
• Track equipment by:
• Name
• Category
• Source (e.g. Dean, White’s)
• Location
• Status (Available, Out, Damaged, etc.)
• Quantity
• Rental start & end dates
• Automatic merging of items when moved back to the same location
• Per-item update tracking (updatedBy)

Move & Split Logic
• Move partial quantities between locations
• Automatically merges rows when items return to the same location with matching metadata
• Prevents duplicate rows for the same item/location/state

PDF Import
• Upload rental PDFs and auto-parse inventory
• Handles:
• Grouped status sections (Full / Partial / Unopened)
• Poor formatting and inconsistent spacing
• Indented sub-lines (ignored when required)
• Designed to be “good enough” for real-world rental paperwork

Export
• Export inventory to:
• CSV
• PDF (print-to-PDF)
• Export options:
• All locations
• Single location
• Multiple locations
• Current filtered/sorted view only
• Intended for client offboarding and data ownership

Mobile Support
• Card-based mobile layout
• Key info visible at a glance
• Details modal for viewing hidden fields (source, dates, updated by)
• Editing, moving, deleting all supported on mobile

Bulk Actions
• Multi-select mode
• Bulk location updates
• Bulk delete

Beta Feedback
• Built-in feedback form for testers
• Submits bugs and feature requests directly to the developer

⸻

🧱 Tech Stack
• Frontend: React + Vite
• Styling: Tailwind CSS (with a centralized design system)
• Backend: Supabase (Postgres + Auth)
• State Management: React Context (no Redux)

⸻

📁 Project Structure (Key Files)

src/
├─ pages/
│ └─ Dashboard.jsx # Main application UI & logic
├─ context/
│ └─ EquipmentContext.jsx # Inventory CRUD + move/merge logic
├─ components/
│ ├─ ImportFileModal.jsx # PDF import & parsing
│ └─ Feedback/
│ ├─ FeedbackModal.jsx
│ └─ FeedbackForm.jsx
├─ lib/
│ └─ supabaseClient.js # Supabase client (canonical import)
├─ index.css # Design system & shared button styles

🎨 Design System

All buttons and interactive elements use shared CSS classes defined in index.css.

Do not hardcode Tailwind colors on buttons.

Common classes:
• btn-accent
• btn-secondary
• btn-danger
• btn-disabled
• Small variants: \*-sm

Text colors:
• text-text – default
• text-accent – headers/highlights
• text-success – Available
• text-warning – Upcoming / Out
• text-danger – Overdue / Damaged

⸻

📦 Data Model

Each inventory row contains:

{
id: string // UUID (primary key)
itemId: string|null // Internal code (hidden in UI)
name: string
category: string
source: string
location: string
status: string
quantity: number
rentalStart: string|null
rentalEnd: string|null
updatedBy: string
}

⚠️ itemId is intentionally hidden from normal UI views
(It appears only in exports and optional detail views.)

⸻

🌍 Environment Separation

Development and production use separate database tables.

Local Development (.env.local)

VITE_EQUIPMENT_TABLE=equipment_items_dev
VITE_LOCATIONS_TABLE=locations_dev

Production (.env)

VITE_EQUIPMENT_TABLE=equipment_items
VITE_LOCATIONS_TABLE=locations

This ensures local testing never affects live client data.

⸻

🛠️ Local Development

npm install
npm run dev

Local app runs at:

http://localhost:5173

🧪 Project Philosophy
• Real-world workflows > perfect data
• Desktop power > mobile completeness
• Clear UI > clever UI
• Modals over browser confirms
• Data integrity over visual polish

GripTrack is built to survive messy PDFs, rushed set days, and human error — not idealized demos.

⸻

📌 Status

GripTrack is currently in active beta with real testers and ongoing feature development.
