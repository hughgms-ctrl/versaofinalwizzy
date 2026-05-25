import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  /** ISO date string (yyyy-MM-dd) or empty */
  value?: string;
  /** Returns ISO date string yyyy-MM-dd */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * DatePicker pt-BR — exibe e aceita dd/MM/yyyy, devolve sempre ISO yyyy-MM-dd.
 * Substitui <input type="date"> que mostra placeholder errado em alguns navegadores.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  className,
  disabled,
  id,
}: DatePickerProps) {
  const parsedDate = React.useMemo(() => {
    if (!value) return undefined;
    // accept ISO (yyyy-MM-dd)
    const iso = parse(value, "yyyy-MM-dd", new Date());
    if (isValid(iso)) return iso;
    const br = parse(value, "dd/MM/yyyy", new Date());
    if (isValid(br)) return br;
    return undefined;
  }, [value]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !parsedDate && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
          {parsedDate ? (
            format(parsedDate, "dd/MM/yyyy", { locale: ptBR })
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsedDate}
          onSelect={(d) => {
            if (!d) {
              onChange("");
              return;
            }
            onChange(format(d, "yyyy-MM-dd"));
          }}
          locale={ptBR}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
