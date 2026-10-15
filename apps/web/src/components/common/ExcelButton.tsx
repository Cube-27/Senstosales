import { cn } from "../../lib/cn.ts";
import { Button, type ButtonProps } from "../ui/button.tsx";

/** The legacy green Excel download button (lists' Download, the documents' DC, GC and Download buttons). */
export function ExcelButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("border-excel bg-excel text-white hover:border-excel-hover hover:bg-excel-hover", className)}
      {...props}
    />
  );
}
