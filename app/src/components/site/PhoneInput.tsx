"use client";

/**
 * Phone field with an international dialing-code selector, so members from India,
 * Bangladesh, the UK, etc. can keep their own number. Digits-only entry (no
 * letters/`e`). Works two ways:
 *   • FormData forms — pass `name`; it writes the combined "+<code> <digits>"
 *     value into a hidden input.
 *   • Controlled React state — pass `onChange` to receive the combined value.
 */
import { useState } from "react";

const DIAL_CODES: [string, string][] = [
  ["+1", "🇺🇸 US / 🇨🇦 CA · +1"],
  ["+91", "🇮🇳 India · +91"],
  ["+880", "🇧🇩 Bangladesh · +880"],
  ["+44", "🇬🇧 UK · +44"],
  ["+61", "🇦🇺 Australia · +61"],
  ["+971", "🇦🇪 UAE · +971"],
  ["+65", "🇸🇬 Singapore · +65"],
  ["+49", "🇩🇪 Germany · +49"],
  ["+33", "🇫🇷 France · +33"],
  ["+81", "🇯🇵 Japan · +81"],
  ["+86", "🇨🇳 China · +86"],
  ["+92", "🇵🇰 Pakistan · +92"],
  ["+94", "🇱🇰 Sri Lanka · +94"],
  ["+977", "🇳🇵 Nepal · +977"],
];

function parse(v: string): { code: string; num: string } {
  const m = (v || "").trim().match(/^(\+\d{1,4})[\s-]*(.*)$/);
  return { code: m ? m[1] : "+1", num: (m ? m[2] : v || "").replace(/\D/g, "") };
}

export default function PhoneInput({
  name,
  defaultValue = "",
  required = false,
  className = "input",
  placeholder = "Phone number",
  onChange,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
}) {
  const initial = parse(defaultValue);
  const [code, setCode] = useState(DIAL_CODES.some(([c]) => c === initial.code) ? initial.code : "+1");
  const [num, setNum] = useState(initial.num);
  const combined = num ? `${code} ${num}` : "";
  const set = (c: string, n: string) => {
    setCode(c);
    setNum(n);
    onChange?.(n ? `${c} ${n}` : "");
  };
  return (
    <div className="flex gap-2">
      <select
        aria-label="Country dialing code"
        className={`${className} !px-2 shrink-0`}
        style={{ maxWidth: "140px" }}
        value={code}
        onChange={(e) => set(e.target.value, num)}
      >
        {DIAL_CODES.map(([c, label]) => (
          <option key={c} value={c}>
            {label}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        required={required}
        className={`${className} flex-1 min-w-0`}
        placeholder={placeholder}
        value={num}
        onChange={(e) => set(code, e.target.value.replace(/\D/g, "").slice(0, 15))}
      />
      {name && <input type="hidden" name={name} value={combined} />}
    </div>
  );
}
