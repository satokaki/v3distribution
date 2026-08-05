import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function EntityFormModal({
  open,
  onClose,
  onSubmit,
  title,
  fields,
  initialData = {},
  submitLabel = "Simpan",
}) {
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const init = {};
      fields.forEach((f) => {
        init[f.name] = initialData[f.name] ?? (f.type === "boolean" ? true : f.type === "number" ? 0 : "");
      });
      setValues(init);
    }
  }, [open, initialData, fields]);

  if (!open) return null;

  const update = (name, val) => setValues((v) => ({ ...v, [name]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card rounded-2xl shadow-2xl border border-border">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map((f) => (
              <div key={f.name} className={f.full ? "sm:col-span-2" : ""}>
                <label className="block text-sm font-medium mb-1.5">
                  {f.label}
                  {f.required && <span className="text-destructive ml-0.5">*</span>}
                </label>
                {f.type === "select" ? (
                  <select
                    value={values[f.name] ?? ""}
                    onChange={(e) => update(f.name, e.target.value)}
                    required={f.required}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Pilih —</option>
                    {f.options.map((opt) => {
                      const val = typeof opt === "object" ? opt.value : opt;
                      const lbl = typeof opt === "object" ? opt.label : opt;
                      return (
                        <option key={val} value={val}>
                          {lbl}
                        </option>
                      );
                    })}
                  </select>
                ) : f.type === "boolean" ? (
                  <button
                    type="button"
                    onClick={() => update(f.name, !values[f.name])}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      values[f.name] ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        values[f.name] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                ) : f.type === "textarea" ? (
                  <textarea
                    value={values[f.name] ?? ""}
                    onChange={(e) => update(f.name, e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <input
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    value={values[f.name] ?? ""}
                    onChange={(e) =>
                      update(f.name, f.type === "number" ? Number(e.target.value) : e.target.value)
                    }
                    required={f.required}
                    disabled={f.disabled}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Menyimpan..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}