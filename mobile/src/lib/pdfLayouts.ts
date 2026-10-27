// Supplier PDF layouts (WP26 Phase 3b): the same template and "teach it"
// code the web and the parse-rental-pdf function run, from
// <repo>/supabase/functions/_shared/pdf (watched by metro.config.js).
export {
  applyTemplate,
  headingsFromLine,
  markerKey,
} from '../../../supabase/functions/_shared/pdf/templates.js';
export {
  buildTemplate,
  defaultLayoutName,
  headingsFor,
  lineText,
  pageOneLines,
} from '../../../supabase/functions/_shared/pdf/teach.js';

/** pdf.js text items per page, as parse-rental-pdf returns them for teaching. */
export type PdfPages = { str: string; transform: number[]; width: number }[][];
