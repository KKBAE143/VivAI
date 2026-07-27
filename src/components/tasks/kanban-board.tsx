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

const COLUMNS: Array<{ status: TaskStatus; tone: "muted" | "primary" | "warning" | "success" }> = [
  { status: "To Do", tone: "muted" },
  { status: "In Progress", tone: "primary" },
  { status: "Review", tone: "warning" },
  { status: "Done", tone: "success" },
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
      className={`rounded-lg bg-card p-3 shadow-sm ring-1 ring-border/50 touch-none ${overlay ? "rotate-1 shadow-xl" : "cursor-grab active:cursor-grabbing"} ${sortable.isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <strong className="text-sm leading-snug">{String(task.title)}</strong>
        {!overlay && (
          <span className="flex gap-1">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onEdit(task)}
              aria-label="Edit task"
              className="p-1"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onDelete(task)}
              aria-label="Delete task"
              className="p-1 text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      {task.description ? (
        <p className="mt-1 text-xs text-muted-foreground">{String(task.description)}</p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{task.due_date ? `Due ${String(task.due_date).slice(0, 10)}` : "No due date"}</span>
        <span className="flex items-center gap-1.5">
          {String(task.priority ?? "med")}
          {initial && (
            <span
              className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[9px] font-semibold text-foreground"
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
  tone,
  tasks,
  members,
  onEdit,
  onDelete,
}: {
  status: TaskStatus;
  tone: "muted" | "primary" | "warning" | "success";
  tasks: ApiRecord[];
  members: ApiRecord[];
  onEdit: (task: ApiRecord) => void;
  onDelete: (task: ApiRecord) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  return (
    <section
      ref={setNodeRef}
      className={`min-h-44 min-w-[260px] flex-1 rounded-xl bg-secondary p-3 md:min-w-0 ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="mb-3 flex justify-between">
        <Badge tone={tone}>{status}</Badge>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <SortableContext
        items={tasks.map((task) => String(task.id))}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
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
            <p className="py-3 text-xs text-muted-foreground">Drop a task here</p>
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
      <div className="mt-4 flex gap-3 overflow-x-auto pb-3 md:grid md:overflow-visible md:pb-0 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <Column
            key={column.status}
            {...column}
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
