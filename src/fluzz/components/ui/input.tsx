import * as React from "react";

import { cn } from "@/fluzz/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onTouchStart, onClick, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    
    // Merge refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
    
    // iOS PWA fix: force focus on touch/click with multiple attempts
    const forceFocus = () => {
      const input = inputRef.current;
      if (!input) return;
      
      // Immediate focus
      input.focus();
      
      // iOS PWA needs delayed focus attempts
      setTimeout(() => input.focus(), 0);
      setTimeout(() => input.focus(), 50);
      setTimeout(() => input.focus(), 100);
    };
    
    const handleTouchStart = (e: React.TouchEvent<HTMLInputElement>) => {
      onTouchStart?.(e);
      forceFocus();
    };
    
    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
      onClick?.(e);
      forceFocus();
    };

    return (
      <input
        type={type}
        // iOS PWA: critical attributes for keyboard to appear
        enterKeyHint={type === "email" ? "next" : type === "password" ? "done" : undefined}
        autoComplete={props.autoComplete ?? "off"}
        autoCapitalize={props.autoCapitalize ?? (type === "email" ? "none" : undefined)}
        autoCorrect={props.autoCorrect ?? "off"}
        spellCheck={props.spellCheck ?? false}
        // Ensure input is not read-only and can receive focus
        readOnly={false}
        onTouchStart={handleTouchStart}
        onClick={handleClick}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          // iOS PWA: ensure proper tap handling
          "select-text cursor-text",
          className,
        )}
        ref={inputRef}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };