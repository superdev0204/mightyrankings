import React, { useMemo, useState } from "react";
import { ICON_LIBRARY, getIconByName } from "@/components/utils/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";

export default function IconPicker({ value, onChange, label = "Icon" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const SelectedIcon = useMemo(() => getIconByName(value), [value]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ICON_LIBRARY;
    return ICON_LIBRARY.filter(
      (i) => i.label.toLowerCase().includes(s) || i.value.toLowerCase().includes(s)
    );
  }, [q]);

  return (
    <div className="space-y-2 relative">
      {label && <label className="text-sm font-medium">{label}</label>}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 justify-between"
          title={value || "Choose an icon"}
        >
          <span className="flex items-center gap-2 truncate">
            <SelectedIcon className="w-4 h-4" />
            <span className="truncate">{value || "Choose…"}</span>
          </span>
          <ChevronDown className="w-4 h-4 opacity-60" />
        </Button>

        {/* quick clear */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange("")}
          title="Clear icon"
        >
          Clear
        </Button>
      </div>

      {open && (
        <Card className="absolute z-50 mt-2 w-full p-3 shadow-lg">
          <Input
            placeholder="Search icons…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-3"
          />
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-64 overflow-auto">
            {filtered.map(({ value: val, label: lab, Icon }) => (
              <button
                type="button"
                key={val}
                onClick={() => {
                  onChange(val);
                  setOpen(false);
                }}
                className={`border rounded-md p-2 hover:bg-gray-50 text-sm flex flex-col items-center gap-2 ${
                  val === value ? "ring-2 ring-blue-500" : ""
                }`}
                title={lab}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-[6rem]">{lab}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}