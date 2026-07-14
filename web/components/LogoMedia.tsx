"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Logo animado reutilizable (hero, historia, footer).
 * - Video cíclico del wordmark con la hebra en movimiento.
 * - Solo reproduce cuando está en viewport (mobile-first: no decodifica varios a la vez).
 * - prefers-reduced-motion → PNG estático optimizado por next/image.
 */
export default function LogoMedia({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  const [reduce, setReduce] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        });
      },
      { threshold: 0.25 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <div className={className}>
      {reduce ? (
        <Image
          src="/logo-poster.jpg"
          alt="Papaghetti"
          fill
          priority={priority}
          sizes="(max-width: 760px) 92vw, 720px"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
      ) : (
        <video
          ref={ref}
          muted
          loop
          playsInline
          preload="metadata"
          poster="/logo-poster.jpg"
          aria-label="Papaghetti"
        >
          <source src="/logo-hero.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
