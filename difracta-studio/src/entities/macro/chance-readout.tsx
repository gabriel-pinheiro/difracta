import { EditableReadout } from "@/inspector/fields/editable-readout";

/**
 * An action's Chance as "40%", clicked to type another. The document holds
 * 0 to 1; the readout speaks percent, and 100 clears it back to always.
 */
export function ChanceReadout({
  chance,
  onChance,
}: {
  /** Undefined when the action always fires. */
  readonly chance: number | undefined;
  /** Null clears the Chance: the action always fires. */
  readonly onChance: (chance: number | null) => void;
}) {
  const percent = Math.round((chance ?? 1) * 100);
  return (
    <EditableReadout
      label="Chance"
      text={String(percent)}
      unit="%"
      className={chance === undefined ? "" : "text-foreground"}
      inputClassName="w-12"
      parse={(text) => {
        const typed = Number(text.replace("%", "").trim());
        if (!Number.isFinite(typed)) return undefined;
        return Math.min(100, Math.max(0, Math.round(typed)));
      }}
      commit={(next) => {
        if (next === percent) return;
        onChance(next >= 100 ? null : next / 100);
      }}
    />
  );
}
