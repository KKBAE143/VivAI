import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/lib/api";

export function MaterialImage({
  materialId,
  ordinal,
  thumbnail = false,
  alt,
  className,
  fallback,
  style,
}: {
  materialId: string;
  ordinal: number;
  thumbnail?: boolean;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  style?: CSSProperties;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!thumbnail);
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (visible || !host.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { rootMargin: "160px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !materialId || !ordinal) return;
    let stopped = false;
    let objectUrl = "";
    const asset = thumbnail ? "thumbnail" : "preview";
    void api<Blob>(`/api/presentation/materials/${materialId}/units/${ordinal}/${asset}`, {
      responseType: "blob",
    })
      .then((blob) => {
        if (stopped) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => !stopped && setSrc(""));
    return () => {
      stopped = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [materialId, ordinal, thumbnail, visible]);

  return (
    <div ref={host} className="contents">
      {src ? <img src={src} alt={alt} className={className} style={style} /> : fallback}
    </div>
  );
}
