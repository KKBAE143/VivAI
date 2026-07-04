function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export function CardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-card p-6 shadow-[var(--shadow-card)] ${className}`}>
      <Block className="h-4 w-1/3" />
      <Block className="mt-3 h-3 w-2/3" />
      <Block className="mt-2 h-3 w-1/2" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Block className="h-8 w-64" />
        <Block className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CardSkeleton className="h-64" />
        <CardSkeleton className="h-64" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
      <Block className="h-4 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Block className="h-4 w-4 rounded" />
            <Block className="h-4 flex-1" />
            <Block className="h-4 w-20" />
            <Block className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Block className="h-8 w-72" />
        <Block className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <CardSkeleton className="h-72 lg:col-span-8" />
        <CardSkeleton className="h-72 lg:col-span-4" />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} className="h-56" />
        ))}
      </div>
    </div>
  );
}
