import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/app-shell";
import { useReorderTasks, type ApiRecord } from "@/lib/hooks";
import type { TaskStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; dotColor: string; bgBadge: string; textBadge: string }
> = {
  "To Do": {
    label: "TO_DO",
    dotColor: "bg-white/40",
    bgBadge: "bg-white/10",
    textBadge: "text-white/70",
  },
  "In Progress": {
    label: "IN_PROGRESS",
    dotColor: "bg-[#AFDDFF]",
    bgBadge: "bg-[#AFDDFF]/15 border border-[#AFDDFF]/30",
    textBadge: "text-[#AFDDFF]",
  },
  Review: {
    label: "IN_REVIEW",
    dotColor: "bg-amber-400",
    bgBadge: "bg-amber-400/15 border border-amber-400/30",
    textBadge: "text-amber-400",
  },
  Done: {
    label: "COMPLETED",
    dotColor: "bg-[#7CE4BA]",
    bgBadge: "bg-[#7CE4BA]/15 border border-[#7CE4BA]/30",
    textBadge: "text-[#7CE4BA]",
  },
};

const COLUMNS: Array<{ status: TaskStatus }> = [
  { status: "To Do" },
  { status: "In Progress" },
  { status: "Review" },
  { status: "Done" },
];

const ordered = (tasks: ApiRecord[]) =>
  [...tasks].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

function assigneeInitial(members: ApiRecord[], assigneeId: unknown): string | null {
  if (!assigneeId) return null;
  const member = members.find((m) => m.profile_id === assigneeId);
  const name = String((member?.profiles as ApiRecord | undefined)?.full_name ?? "");
  return name ? name.charAt(0).toUpperCase() : "?";
}

function Card({
  task,
  members,
  onEdit,
  onDelete,
  overlay = false,
}: {
  task: ApiRecord;
  members: ApiRecord[];
  onEdit: (task: ApiRecord) => void;
  onDelete: (task: ApiRecord) => void;
  overlay?: boolean;
}) {
  const id = String(task.id);
  const sortable = useSortable({ id, disabled: overlay });
  const initial = assigneeInitial(members, task.assignee_id);
  return (
    <article
      ref={sortable.setNodeRef}
      style={
        overlay
          ? undefined
          : {
              transform: CSS.Transform.toString(sortable.transform),
              transition: sortable.transition,
            }
      }
      {...sortable.attributes}
      {...sortable.listeners}
      className={`rounded-xl bg-[#0A0E16]/95 border border-white/10 p-3.5 shadow-md backdrop-blur-xl font-manrope touch-none transition-all ${
        overlay
          ? "rotate-1 shadow-2xl border-[#AFDDFF] scale-105"
          : "cursor-grab active:cursor-grabbing hover:border-white/20"
      } ${sortable.isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="text-xs sm:text-sm font-bold text-white leading-snug font-graphik">
          {String(task.title)}
        </strong>
        {!overlay && (
          <span className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onEdit(task)}
              aria-label="Edit task"
              className="grid h-8 w-8 min-h-[32px] min-w-[32px] place-items-center rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete(task)}
              aria-label="Delete task"
              className="grid h-8 w-8 min-h-[32px] min-w-[32px] place-items-center rounded-lg bg-white/5 border border-white/10 text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 active:scale-90 transition-all cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      {task.description ? (
        <p className="mt-1.5 text-xs text-white/50 line-clamp-2 leading-relaxed">
          {String(task.description)}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-white/5 text-[10px] text-white/40">
        <span>{task.due_date ? `Due ${String(task.due_date).slice(0, 10)}` : "No due date"}</span>
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] uppercase text-white/60">
            {String(task.priority ?? "med")}
          </span>
          {initial && (
            <span
              className="grid h-5 w-5 place-items-center rounded-full bg-[#AFDDFF] text-[10px] font-bold text-black shadow-xs"
              title="Assignee"
            >
              {initial}
            </span>
          )}
        </span>
      </div>
    </article>
  );
}

function Column({
  status,
  tasks,
  members,
  onEdit,
  onDelete,
}: {
  status: TaskStatus;
  tasks: ApiRecord[];
  members: ApiRecord[];
  onEdit: (task: ApiRecord) => void;
  onDelete: (task: ApiRecord) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    dotColor: "bg-white/40",
    bgBadge: "bg-white/10",
    textBadge: "text-white",
  };

  return (
    <section
      ref={setNodeRef}
      className={`snap-center min-h-48 min-w-[280px] xs:min-w-[300px] shrink-0 md:shrink md:min-w-0 flex-1 rounded-2xl border border-white/10 bg-card/80 p-3.5 backdrop-blur-xl transition-all ${
        isOver ? "ring-2 ring-[#AFDDFF] bg-[#AFDDFF]/5 border-[#AFDDFF]/50" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between pb-2 border-b border-white/10">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold font-mono ${cfg.bgBadge} ${cfg.textBadge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
          {cfg.label}
        </span>
        <span className="text-xs font-mono font-bold text-white/50">{tasks.length}</span>
      </div>
      <SortableContext
        items={tasks.map((task) => String(task.id))}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2.5">
          {tasks.map((task) => (
            <Card
              key={String(task.id)}
              task={task}
              members={members}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          {tasks.length === 0 && (
            <div className="py-6 text-center rounded-xl border border-dashed border-white/10 bg-white/2">
              <p className="text-xs text-white/40 font-mono">Drop task here</p>
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

export function KanbanBoard({
  projectId,
  tasks,
  teamMembers = [],
  onEdit,
  onDelete,
}: {
  projectId: string;
  tasks: ApiRecord[];
  teamMembers?: ApiRecord[];
  onEdit: (task: ApiRecord) => void;
  onDelete: (task: ApiRecord) => void;
}) {
  const [active, setActive] = useState<ApiRecord | null>(null);
  const reorder = useReorderTasks();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const groups = Object.fromEntries(
    COLUMNS.map(({ status }) => [
      status,
      ordered(tasks.filter((task) => String(task.status ?? "To Do") === status)),
    ]),
  ) as Record<TaskStatus, ApiRecord[]>;
  const onDragEnd = ({ active: drag, over }: DragEndEvent) => {
    setActive(null);
    if (!over) return;
    const moving = tasks.find((task) => String(task.id) === String(drag.id));
    if (!moving) return;
    const overId = String(over.id);
    const destination = overId.startsWith("column:")
      ? (overId.slice(7) as TaskStatus)
      : (tasks.find((task) => String(task.id) === overId)?.status as TaskStatus | undefined);
    if (!destination) return;
    const source = String(moving.status ?? "To Do") as TaskStatus;
    const sourceTasks = groups[source].filter((task) => String(task.id) !== String(moving.id));
    const destinationTasks = source === destination ? sourceTasks : [...groups[destination]];
    const targetIndex = overId.startsWith("column:")
      ? destinationTasks.length
      : destinationTasks.findIndex((task) => String(task.id) === overId);
    destinationTasks.splice(targetIndex < 0 ? destinationTasks.length : targetIndex, 0, {
      ...moving,
      status: destination,
    });
    const columns =
      source === destination
        ? [{ status: destination, tasks: destinationTasks }]
        : [
            { status: source, tasks: sourceTasks },
            { status: destination, tasks: destinationTasks },
          ];
    const moves = columns.flatMap((column) =>
      column.tasks.map((task, index) => ({
        id: String(task.id),
        status: column.status,
        sort_order: (index + 1) * 1000,
      })),
    );
    reorder.mutate({ projectId, moves });
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: drag }) =>
        setActive(tasks.find((task) => String(task.id) === String(drag.id)) ?? null)
      }
      onDragCancel={() => setActive(null)}
      onDragEnd={onDragEnd}
    >
      <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 md:grid md:overflow-visible md:pb-0 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.status}
            status={column.status}
            tasks={groups[column.status]}
            members={teamMembers}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <Card task={active} members={teamMembers} onEdit={() => {}} onDelete={() => {}} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
