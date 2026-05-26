export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="bg-vignette" />
      <div className="bg-scanline" />
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {SPECKS.map((s) => (
          <circle
            key={s.id}
            cx={`${s.cx}%`}
            cy={`${s.cy}%`}
            r={s.r}
            fill={`rgba(169,120,235,${s.opacity})`}
            style={{
              animation: `speck-${s.anim} ${s.dur}s linear ${s.delay}s infinite`,
              willChange: "transform",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

const SPECKS = [
  { id:  1, cx:  8, cy: 12, r: 1.2, opacity: 0.55, anim: "a", dur: 14, delay:  0   },
  { id:  2, cx: 23, cy: 44, r: 0.8, opacity: 0.35, anim: "b", dur: 17, delay: -4   },
  { id:  3, cx: 41, cy: 18, r: 1.5, opacity: 0.45, anim: "c", dur: 11, delay: -2   },
  { id:  4, cx: 67, cy:  8, r: 0.7, opacity: 0.30, anim: "d", dur: 20, delay: -8   },
  { id:  5, cx: 82, cy: 31, r: 1.1, opacity: 0.50, anim: "e", dur: 15, delay: -3   },
  { id:  6, cx: 55, cy: 62, r: 0.9, opacity: 0.40, anim: "f", dur: 13, delay: -10  },
  { id:  7, cx: 14, cy: 75, r: 1.3, opacity: 0.42, anim: "g", dur: 18, delay: -5   },
  { id:  8, cx: 91, cy: 55, r: 0.6, opacity: 0.28, anim: "h", dur: 22, delay: -13  },
  { id:  9, cx: 33, cy: 88, r: 1.0, opacity: 0.38, anim: "a", dur: 16, delay: -7   },
  { id: 10, cx: 76, cy: 79, r: 0.8, opacity: 0.33, anim: "b", dur: 19, delay: -1   },
  { id: 11, cx: 49, cy: 35, r: 1.4, opacity: 0.48, anim: "c", dur: 12, delay: -9   },
  { id: 12, cx:  4, cy: 58, r: 0.7, opacity: 0.30, anim: "d", dur: 21, delay: -6   },
  { id: 13, cx: 62, cy: 22, r: 1.0, opacity: 0.44, anim: "e", dur: 14, delay: -11  },
  { id: 14, cx: 88, cy: 91, r: 0.9, opacity: 0.36, anim: "f", dur: 17, delay: -3   },
  { id: 15, cx: 19, cy: 96, r: 1.2, opacity: 0.52, anim: "g", dur: 13, delay: -8   },
  { id: 16, cx: 44, cy: 51, r: 0.6, opacity: 0.26, anim: "h", dur: 23, delay: -15  },
  { id: 17, cx: 71, cy: 68, r: 1.1, opacity: 0.46, anim: "a", dur: 16, delay: -4   },
  { id: 18, cx: 30, cy: 29, r: 0.8, opacity: 0.34, anim: "b", dur: 18, delay: -12  },
  { id: 19, cx: 58, cy: 83, r: 1.3, opacity: 0.43, anim: "c", dur: 11, delay: -1   },
  { id: 20, cx: 96, cy: 15, r: 0.7, opacity: 0.29, anim: "d", dur: 22, delay: -10  },
  { id: 21, cx: 11, cy: 40, r: 1.0, opacity: 0.40, anim: "e", dur: 15, delay: -6   },
  { id: 22, cx: 85, cy: 47, r: 1.5, opacity: 0.54, anim: "f", dur: 12, delay: -14  },
  { id: 23, cx: 37, cy: 65, r: 0.9, opacity: 0.37, anim: "g", dur: 20, delay: -9   },
  { id: 24, cx: 53, cy:  5, r: 1.1, opacity: 0.47, anim: "h", dur: 21, delay: -7   },
];
