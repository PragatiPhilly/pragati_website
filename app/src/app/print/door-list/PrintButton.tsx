"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary !py-2 !px-5 text-sm">
      🖨 Print
    </button>
  );
}
