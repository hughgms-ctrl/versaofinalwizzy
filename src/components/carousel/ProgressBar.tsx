import { Progress } from "@/components/ui/progress";

interface Props {
  done: number;
  total: number;
  label?: string;
}

export default function CarouselProgressBar({ done, total, label }: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{label ?? "Gerando..."}</span>
        <span>
          {done}/{total} ({pct}%)
        </span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
