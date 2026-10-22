import * as React from "react"

import { cn } from "@/shared/lib/cn"

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  viewportRows?: number
  rowHeight?: number
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(({ className, viewportRows, rowHeight, ...props }, ref) => (
  <div
    data-slot="table-scroll-container"
    className={cn(
      "relative w-full overflow-auto",
      viewportRows && "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-30 [&_thead]:bg-card"
    )}
    style={viewportRows && rowHeight ? { maxHeight: 36 + viewportRows * rowHeight } : undefined}
  >
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b-2 [&_tr]:border-border", className)} {...props} />
))

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t-2 border-border bg-muted font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border transition-colors hover:bg-muted data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 border-b-2 border-border bg-muted px-3 text-left align-middle text-[11px] font-bold uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[1px]",
      className
    )}
    {...props}
  />
))

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[1px]",
      className
    )}
    {...props}
  />
))

const TableActionHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <TableHead
    ref={ref}
    className={cn("sticky right-0 z-20 w-12 min-w-12 bg-card px-2", className)}
    {...props}
  />
))
TableActionHead.displayName = "TableActionHead"

const TableActionCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <TableCell
    ref={ref}
    className={cn(
      "sticky right-0 z-10 w-12 min-w-12 bg-card px-2 transition-colors group-hover:bg-muted group-data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableActionCell.displayName = "TableActionCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableActionHead,
  TableActionCell,
  TableCaption,
}
