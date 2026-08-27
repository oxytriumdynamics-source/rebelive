"use client";

import { motion } from "framer-motion";

/**
 * EverestPattern — Pure transparent vector outline of Mount Everest & Himalayan ridge.
 *
 * - Zero text or captions — pure architectural contour & ridge line art.
 * - 100% transparent vector background.
 * - Full-width bottom coverage: rising from low foothills on the bottom-left
 *   to a massive Everest summit on the upper-right.
 */
export default function EverestPattern({
  opacity = 0.28,
  strokeColor,
  className = "",
}: {
  opacity?: number;
  strokeColor?: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity, y: 0 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      className={`pointer-events-none absolute bottom-0 left-0 right-0 z-0 w-full select-none overflow-hidden ${className}`}
      style={{
        height: "clamp(260px, 55vh, 620px)",
        color: strokeColor,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1600 700"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className={`h-full w-full ${!strokeColor ? "stroke-black" : ""}`}
        style={{
          vectorEffect: "non-scaling-stroke",
          stroke: strokeColor ? strokeColor : undefined,
        }}
      >
        {/* ══════════════════════════════════════════════════════
            BACKGROUND DISTANT RIDGE (fine subtle line)
            ══════════════════════════════════════════════════════ */}
        <path
          d="M0 640 L80 620 L160 590 L240 610 L330 550 L420 570 L510 510 L600 525 L710 460 L800 480 L920 390 L1020 410 L1150 280 L1240 310 L1340 140 L1380 90 L1410 110 L1490 240 L1560 380 L1600 460"
          strokeWidth="0.8"
          strokeOpacity="0.4"
          strokeLinejoin="round"
        />

        {/* ══════════════════════════════════════════════════════
            MAIN EVEREST SUMMIT & PRIMARY HIMALAYAN RIDGELINE
            Rising from ~630px at x=0 to summit at (1360, 60)
            ══════════════════════════════════════════════════════ */}
        <path
          d="M0 660 
             L60 635 L110 645 L170 610 L230 625 L290 580 L350 595 L420 540 
             L480 560 L560 490 L630 515 L720 440 L790 465 L880 390 L950 415 
             L1060 330 L1120 355 L1210 240 L1270 265 L1335 120 L1360 65 
             L1378 95 L1405 90 L1440 180 L1480 260 L1530 390 L1570 480 L1600 550"
          strokeWidth="1.8"
          strokeOpacity="0.95"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* ══════════════════════════════════════════════════════
            SUMMIT PYRAMID (Hillary Step, North Face & Ridge Arcs)
            ══════════════════════════════════════════════════════ */}
        {/* Main Everest central rib / North Face couloir */}
        <path
          d="M1360 65 L1340 160 L1320 240 L1290 340 L1250 450 L1210 560 L1180 660"
          strokeWidth="1.4"
          strokeOpacity="0.85"
          strokeLinejoin="round"
        />
        {/* Hillary Step ridge structure */}
        <path
          d="M1360 65 L1385 140 L1410 210 L1435 320 L1470 440 L1500 560 L1530 680"
          strokeWidth="1.3"
          strokeOpacity="0.8"
          strokeLinejoin="round"
        />
        {/* Upper Northeast Ridge bands */}
        <path
          d="M1335 120 L1365 145 L1385 140 M1310 180 L1350 205 L1395 195 M1280 240 L1330 270 L1420 250"
          strokeWidth="1.0"
          strokeOpacity="0.65"
          strokeLinejoin="round"
        />
        {/* Yellow Band rock strata lines (horizontal mountain layers) */}
        <path
          d="M1240 310 L1300 335 L1360 320 L1440 300 
             M1220 360 L1280 385 L1340 370 L1455 350
             M1190 410 L1260 435 L1330 420 L1470 395
             M1160 460 L1240 485 L1310 470 L1480 445"
          strokeWidth="0.85"
          strokeOpacity="0.5"
          strokeLinejoin="round"
        />

        {/* ══════════════════════════════════════════════════════
            SOUTH COL & LHOTSE (MID-RIGHT ELEVATION PEAKS)
            ══════════════════════════════════════════════════════ */}
        {/* Lhotse peak rib & face lines */}
        <path
          d="M1210 240 L1180 320 L1140 410 L1090 510 L1040 620
             M1210 240 L1235 300 L1260 380 L1290 490"
          strokeWidth="1.2"
          strokeOpacity="0.75"
          strokeLinejoin="round"
        />
        {/* Nuptse ridge flank */}
        <path
          d="M1060 330 L1030 400 L990 490 L940 590 L890 690
             M1060 330 L1085 390 L1110 480"
          strokeWidth="1.1"
          strokeOpacity="0.7"
          strokeLinejoin="round"
        />
        {/* Mid-mountain rock strata & couloirs */}
        <path
          d="M1020 370 L1065 400 L1120 385
             M980 420 L1035 450 L1095 435
             M940 470 L1005 500 L1070 485
             M890 520 L965 550 L1040 535"
          strokeWidth="0.8"
          strokeOpacity="0.45"
          strokeLinejoin="round"
        />

        {/* ══════════════════════════════════════════════════════
            LOWER FOOTHILLS & CIRQUE RIDGES (LEFT TO MID ELEVATIONS)
            ══════════════════════════════════════════════════════ */}
        {/* Western cwm & glacier moraine valley ridges */}
        <path
          d="M880 390 L840 460 L790 540 L730 630
             M720 440 L680 500 L630 580 L570 670
             M560 490 L520 545 L470 620 L410 700
             M420 540 L380 590 L330 660
             M290 580 L250 625 L200 690
             M170 610 L130 655 L80 700"
          strokeWidth="1.0"
          strokeOpacity="0.6"
          strokeLinejoin="round"
        />
        {/* Secondary topographic contour hatchings */}
        <path
          d="M760 480 L800 510 L840 495 
             M680 530 L725 560 L770 545
             M600 575 L645 605 L690 590
             M520 615 L565 645 L610 630
             M440 650 L485 675 L530 665
             M350 675 L390 695"
          strokeWidth="0.75"
          strokeOpacity="0.4"
          strokeLinejoin="round"
        />

        {/* ══════════════════════════════════════════════════════
            BASE GLACIAL CONTOUR LINES (SUBTLE BEDROCK DETAILS)
            ══════════════════════════════════════════════════════ */}
        <path
          d="M0 690 Q200 680 400 685 T800 675 T1200 670 T1600 665
             M0 675 Q250 665 500 670 T1000 660 T1500 650 T1600 645"
          strokeWidth="0.6"
          strokeOpacity="0.3"
          strokeDasharray="4 6"
        />
      </svg>
    </motion.div>
  );
}
