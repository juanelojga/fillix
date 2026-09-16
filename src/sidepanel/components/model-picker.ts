/** One row in a ModelPicker dropdown. A UI prop type, so not in src/types.ts. */
export interface ModelOption {
  /** Returned to onSelect. '' is legitimate: it means "follow the active model". */
  value: string;
  label: string;
  /** Secondary muted text on the row, e.g. what a follow option resolves to. */
  hint?: string;
}
