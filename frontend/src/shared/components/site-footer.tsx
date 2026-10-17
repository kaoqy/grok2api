export function SiteFooter() {
  return (
    <footer className="mt-2 border-t">
      <div className="mx-auto flex h-12 max-w-[2000px] items-center justify-between gap-3 px-4 text-[11px] text-muted-foreground sm:px-5 xl:px-7">
        <a className="transition-colors hover:text-foreground" href="https://github.com/kaoqy/grok2api" target="_blank" rel="noreferrer">Grok2API</a>
        <span>© 2026</span>
      </div>
    </footer>
  );
}
