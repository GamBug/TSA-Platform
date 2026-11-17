import React, { useEffect, useState } from 'react'
import type { FigureSpec, FigureVariant } from '../types/tsa'
import { IconCross, IconExpand } from './Icons'

interface DiagramSVGProps {
  detailedGrid?: boolean
  className?: string
}

function CatalyticYieldPlot({ detailedGrid = false, className = '' }: DiagramSVGProps) {
  // Plot area: x from 64 to 536 (T: 300 -> 600 °C), y from 28 to 238 (eta: 80% -> 10%)
  // x(T) = 64 + ((T - 300) / 300) * 472
  // y(eta) = 238 - ((eta - 10) / 70) * 210  => 3px per 1%
  const xTicks = [300, 350, 400, 450, 500, 550, 600]
  const yTicks = [10, 20, 30, 40, 50, 60, 70, 80]
  const fineYTicks = [15, 25, 35, 45, 55, 65, 75]

  const mapX = (t: number) => 64 + ((t - 300) / 300) * 472
  const mapY = (eta: number) => 238 - ((eta - 10) / 70) * 210

  // Curve P2 = 350 atm (higher yield, teacher-red dashed curve)
  const p2Points: [number, number][] = [
    [300, 74],
    [350, 66],
    [400, 56],
    [450, 45],
    [500, 34],
    [550, 25],
    [600, 18],
  ]

  // Curve P1 = 200 atm (lower yield, fountain-pen ink solid curve)
  const p1Points: [number, number][] = [
    [300, 59],
    [350, 50],
    [400, 40],
    [450, 30],
    [500, 22],
    [550, 16],
    [600, 12],
  ]

  const toPolyline = (pts: [number, number][]) =>
    pts.map(([t, eta]) => `${mapX(t).toFixed(1)},${mapY(eta).toFixed(1)}`).join(' ')

  return (
    <svg
      viewBox="0 0 576 286"
      className={`w-full h-auto select-none ${className}`}
      role="img"
      aria-label="Hình 2.4: Đồ thị hiệu suất chuyển hoá cân bằng theo nhiệt độ ở hai mức áp suất P1 và P2"
    >
      {/* Nền vùng đồ thị */}
      <rect x="64" y="28" width="472" height="210" fill="#FBF8F1" />

      {/* Lưới chia phụ 5% khi bật chế độ gióng chi tiết */}
      {detailedGrid &&
        fineYTicks.map((eta) => (
          <line
            key={`fine-y-${eta}`}
            x1={64}
            y1={mapY(eta)}
            x2={536}
            y2={mapY(eta)}
            stroke="#D9D0BF"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />
        ))}

      {detailedGrid &&
        [325, 375, 425, 475, 525, 575].map((t) => (
          <line
            key={`fine-x-${t}`}
            x1={mapX(t)}
            y1={28}
            x2={mapX(t)}
            y2={238}
            stroke="#D9D0BF"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />
        ))}

      {/* Lưới toạ độ chính */}
      {yTicks.map((eta) => (
        <g key={`y-${eta}`}>
          <line
            x1={64}
            y1={mapY(eta)}
            x2={536}
            y2={mapY(eta)}
            stroke="#D9D0BF"
            strokeWidth="1"
          />
          <text
            x={54}
            y={mapY(eta) + 4}
            textAnchor="end"
            fill="#485164"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
          >
            {eta}
          </text>
        </g>
      ))}

      {xTicks.map((t) => (
        <g key={`x-${t}`}>
          <line
            x1={mapX(t)}
            y1={28}
            x2={mapX(t)}
            y2={238}
            stroke="#D9D0BF"
            strokeWidth="1"
          />
          <text
            x={mapX(t)}
            y={255}
            textAnchor="middle"
            fill="#485164"
            fontSize="11"
            fontFamily="JetBrains Mono, monospace"
          >
            {t}
          </text>
        </g>
      ))}

      {/* Đường gióng mốc vận hành tối ưu T* = 450 °C */}
      <line
        x1={mapX(450)}
        y1={28}
        x2={mapX(450)}
        y2={238}
        stroke="#B7791F"
        strokeWidth="1.2"
        strokeDasharray="4 3"
      />
      <rect
        x={mapX(450) + 6}
        y={34}
        width={116}
        height={20}
        fill="#F6EFE0"
        stroke="#B7791F"
        strokeWidth="0.9"
      />
      <text
        x={mapX(450) + 12}
        y={47.5}
        fill="#B7791F"
        fontSize="10"
        fontWeight="600"
        fontFamily="JetBrains Mono, monospace"
      >
        Mốc T* = 450 °C
      </text>

      {/* Khung trục chính bằng mực xanh đen */}
      <polyline
        points="64,24 64,238 542,238"
        fill="none"
        stroke="#1B2230"
        strokeWidth="1.5"
      />
      {/* Mũi tên trục */}
      <polygon points="64,20 60.8,26.5 67.2,26.5" fill="#1B2230" />
      <polygon points="546,238 539.5,234.8 539.5,241.2" fill="#1B2230" />

      {/* Đường cong P2 = 350 atm (Mực bút đỏ, nét đứt) */}
      <polyline
        points={toPolyline(p2Points)}
        fill="none"
        stroke="#C4322B"
        strokeWidth="2"
        strokeDasharray="6 3.5"
      />
      {p2Points.map(([t, eta]) => (
        <circle
          key={`p2-${t}`}
          cx={mapX(t)}
          cy={mapY(eta)}
          r="3.4"
          fill="#FBF8F1"
          stroke="#C4322B"
          strokeWidth="1.6"
        />
      ))}

      {/* Đường cong P1 = 200 atm (Mực xanh đen, nét liền) */}
      <polyline
        points={toPolyline(p1Points)}
        fill="none"
        stroke="#1B2230"
        strokeWidth="1.9"
      />
      {p1Points.map(([t, eta]) => (
        <rect
          key={`p1-${t}`}
          x={mapX(t) - 3}
          y={mapY(eta) - 3}
          width="6"
          height="6"
          fill="#1B2230"
        />
      ))}

      {/* Điểm giao gióng Δeta = 15% tại 450 °C */}
      <line
        x1={64}
        y1={mapY(45)}
        x2={mapX(450)}
        y2={mapY(45)}
        stroke="#C4322B"
        strokeWidth="0.9"
        strokeDasharray="2.5 2.5"
      />
      <line
        x1={64}
        y1={mapY(30)}
        x2={mapX(450)}
        y2={mapY(30)}
        stroke="#1B2230"
        strokeWidth="0.9"
        strokeDasharray="2.5 2.5"
      />

      {/* Hộp chú giải (Legend) */}
      <rect
        x="362"
        y="66"
        width="162"
        height="48"
        fill="#F6F1E7"
        stroke="#D9D0BF"
        strokeWidth="1"
      />
      <line
        x1="372"
        y1="81"
        x2="398"
        y2="81"
        stroke="#C4322B"
        strokeWidth="1.8"
        strokeDasharray="5 3"
      />
      <circle cx="385" cy="81" r="3" fill="#FBF8F1" stroke="#C4322B" strokeWidth="1.5" />
      <text
        x="406"
        y="84.5"
        fill="#1B2230"
        fontSize="10.5"
        fontFamily="JetBrains Mono, monospace"
      >
        P₂ = 350 atm
      </text>

      <line x1="372" y1="100" x2="398" y2="100" stroke="#1B2230" strokeWidth="1.8" />
      <rect x="382" y="97" width="6" height="6" fill="#1B2230" />
      <text
        x="406"
        y="103.5"
        fill="#1B2230"
        fontSize="10.5"
        fontFamily="JetBrains Mono, monospace"
      >
        P₁ = 200 atm
      </text>

      {/* Nhãn hai trục toạ độ */}
      <text
        x="18"
        y="136"
        textAnchor="middle"
        fill="#1B2230"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="Be Vietnam Pro, sans-serif"
        transform="rotate(-90 18 136)"
      >
        Hiệu suất cân bằng η (%)
      </text>
      <text
        x="300"
        y="278"
        textAnchor="middle"
        fill="#1B2230"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="Be Vietnam Pro, sans-serif"
      >
        Nhiệt độ buồng xúc tác T (°C)
      </text>
    </svg>
  )
}

function CubicTangentPlot({ detailedGrid = false, className = '' }: DiagramSVGProps) {
  // x from -2.2 to 2.2 -> [56 .. 520], center O at x=288, y=156
  // scaleX = 105 px/unit, scaleY = 30 px/unit (y from -3 to 4.5)
  const ox = 288
  const oy = 166
  const sx = 96
  const sy = 32
  const mapX = (x: number) => ox + x * sx
  const mapY = (y: number) => oy - y * sy

  const curvePoints: string[] = []
  for (let x = -2.1; x <= 2.15; x += 0.08) {
    const y = x * x * x - 3 * x + 2
    if (y >= -2.5 && y <= 4.6) {
      curvePoints.push(`${mapX(x).toFixed(1)},${mapY(y).toFixed(1)}`)
    }
  }

  return (
    <svg
      viewBox="0 0 576 286"
      className={`w-full h-auto select-none ${className}`}
      role="img"
      aria-label="Hình 1.1: Đồ thị hàm số bậc ba y = x³ − 3x + 2"
    >
      <rect x="48" y="20" width="480" height="236" fill="#FBF8F1" />

      {/* Lưới phụ 0,5 đơn vị */}
      {detailedGrid &&
        [-1.5, -0.5, 0.5, 1.5].map((x) => (
          <line
            key={`gx-${x}`}
            x1={mapX(x)}
            y1={20}
            x2={mapX(x)}
            y2={256}
            stroke="#D9D0BF"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />
        ))}

      {detailedGrid &&
        [-1.5, -0.5, 0.5, 1.5, 2.5, 3.5].map((y) => (
          <line
            key={`gy-${y}`}
            x1={48}
            y1={mapY(y)}
            x2={528}
            y2={mapY(y)}
            stroke="#D9D0BF"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />
        ))}

      {/* Lưới chính */}
      {[-2, -1, 0, 1, 2].map((x) => (
        <g key={`x-${x}`}>
          <line x1={mapX(x)} y1={20} x2={mapX(x)} y2={256} stroke="#D9D0BF" strokeWidth="1" />
          {x !== 0 && (
            <text
              x={mapX(x)}
              y={oy + 16}
              textAnchor="middle"
              fill="#485164"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
            >
              {x}
            </text>
          )}
        </g>
      ))}

      {[-2, -1, 0, 1, 2, 3, 4].map((y) => (
        <g key={`y-${y}`}>
          <line x1={48} y1={mapY(y)} x2={528} y2={mapY(y)} stroke="#D9D0BF" strokeWidth="1" />
          {y !== 0 && (
            <text
              x={ox - 10}
              y={mapY(y) + 4}
              textAnchor="end"
              fill="#485164"
              fontSize="11"
              fontFamily="JetBrains Mono, monospace"
            >
              {y}
            </text>
          )}
        </g>
      ))}

      {/* Hai trục toạ độ Ox, Oy */}
      <line x1="48" y1={oy} x2="528" y2={oy} stroke="#1B2230" strokeWidth="1.5" />
      <line x1={ox} y1="256" x2={ox} y2="20" stroke="#1B2230" strokeWidth="1.5" />
      <polygon points={`534,${oy} 526,${oy - 3.5} 526,${oy + 3.5}`} fill="#1B2230" />
      <polygon points={`${ox},14 ${ox - 3.5},22 ${ox + 3.5},22`} fill="#1B2230" />

      <text
        x="524"
        y={oy - 8}
        fill="#1B2230"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="JetBrains Mono, monospace"
      >
        x
      </text>
      <text
        x={ox + 10}
        y="26"
        fill="#1B2230"
        fontSize="11.5"
        fontWeight="600"
        fontFamily="JetBrains Mono, monospace"
      >
        y
      </text>
      <text
        x={ox - 12}
        y={oy + 15}
        fill="#1B2230"
        fontSize="11"
        fontFamily="JetBrains Mono, monospace"
      >
        O
      </text>

      {/* Đường tiếp tuyến tại điểm cực tiểu (1; 0) */}
      <line
        x1={mapX(-0.5)}
        y1={oy}
        x2={mapX(2.1)}
        y2={oy}
        stroke="#C4322B"
        strokeWidth="2"
        strokeDasharray="5 3"
      />

      {/* Đồ thị y = x³ - 3x + 2 */}
      <polyline
        points={curvePoints.join(' ')}
        fill="none"
        stroke="#1B2230"
        strokeWidth="2.1"
      />

      {/* Các điểm đặc biệt: CĐ(-1; 4), Giao Oy(0; 2), CT(1; 0) */}
      <circle cx={mapX(-1)} cy={mapY(4)} r="3.6" fill="#FBF8F1" stroke="#1B2230" strokeWidth="1.8" />
      <circle cx={mapX(0)} cy={mapY(2)} r="3.6" fill="#FBF8F1" stroke="#1B2230" strokeWidth="1.8" />
      <circle cx={mapX(1)} cy={mapY(0)} r="4.2" fill="#C4322B" stroke="#FBF8F1" strokeWidth="1.4" />

      <rect x={mapX(1) - 34} y={oy - 32} width="76" height="20" fill="#F8EAE8" stroke="#C4322B" strokeWidth="1" />
      <text
        x={mapX(1) + 4}
        y={oy - 18.5}
        textAnchor="middle"
        fill="#C4322B"
        fontSize="10.5"
        fontWeight="600"
        fontFamily="JetBrains Mono, monospace"
      >
        M(1; 0)
      </text>
    </svg>
  )
}

function FigureSvgByVariant({
  variant,
  detailedGrid,
}: {
  variant: FigureVariant
  detailedGrid: boolean
}) {
  if (variant === 'parabola-tangent') {
    return <CubicTangentPlot detailedGrid={detailedGrid} />
  }
  return <CatalyticYieldPlot detailedGrid={detailedGrid} />
}

interface FigurePlateProps {
  figure: FigureSpec
}

export function FigurePlate({ figure }: FigurePlateProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [zoomPercent, setZoomPercent] = useState<100 | 125 | 150>(125)
  const [showDetailedGrid, setShowDetailedGrid] = useState(true)

  useEffect(() => {
    if (!isExpanded) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded])

  return (
    <>
      <figure className="bg-paper-sheet border border-rule rounded-[3px] my-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-paper border-b border-rule">
          <div className="flex items-center gap-2 min-w-0">
            <span className="tabular-figures text-xs font-semibold text-ink bg-paper-recessed border border-rule px-2 py-0.5 rounded-[2px] shrink-0">
              {figure.code}
            </span>
            <span className="text-xs sm:text-[13px] font-medium text-ink truncate">
              {figure.title}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-pen-red hover:text-pen-red rounded-[3px] transition-colors cursor-pointer shrink-0"
            aria-haspopup="dialog"
            aria-expanded={isExpanded}
          >
            <IconExpand size={14} />
            <span>Phóng to</span>
          </button>
        </div>

        <div className="p-2.5 sm:p-4 bg-paper-sheet">
          <FigureSvgByVariant variant={figure.variant} detailedGrid={false} />
        </div>

        <figcaption className="px-3.5 py-2 bg-paper border-t border-rule flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-ink-secondary">
          <span>{figure.caption}</span>
        </figcaption>
      </figure>

      {/* Trên di động 390px: mở tràn toàn màn hình (inset-0); trên máy tính: hộp thoại lớn */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-ink/65 flex items-center justify-center p-0 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expanded-figure-title"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[92vh] flex flex-col bg-paper-sheet border-0 sm:border sm:border-ink sm:rounded-[4px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-paper border-b border-rule">
              <div className="flex items-center gap-2 min-w-0">
                <span className="tabular-figures text-xs font-semibold text-paper-sheet bg-ink px-2 py-0.5 rounded-[2px] shrink-0">
                  {figure.code}
                </span>
                <h3 id="expanded-figure-title" className="text-sm font-semibold text-ink truncate">
                  {figure.title}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDetailedGrid((prev) => !prev)}
                  className={`px-3 min-h-[44px] text-xs font-medium border rounded-[3px] cursor-pointer transition-colors ${
                    showDetailedGrid
                      ? 'bg-pen-red-wash border-pen-red text-pen-red'
                      : 'bg-paper-sheet border-rule text-ink-secondary hover:border-ink'
                  }`}
                >
                  Lưới phụ: {showDetailedGrid ? 'Bật' : 'Tắt'}
                </button>

                <div
                  className="inline-flex border border-rule rounded-[3px] overflow-hidden bg-paper-sheet"
                  role="group"
                  aria-label="Mức phóng đại hình vẽ"
                >
                  {([100, 125, 150] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setZoomPercent(level)}
                      className={`tabular-figures px-2.5 min-h-[44px] text-xs font-medium cursor-pointer border-r last:border-r-0 border-rule transition-colors ${
                        zoomPercent === level
                          ? 'bg-ink text-paper-sheet'
                          : 'text-ink-secondary hover:bg-paper-recessed'
                      }`}
                    >
                      {level}%
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-pen-red hover:text-pen-red rounded-[3px] cursor-pointer"
                >
                  <IconCross size={12} />
                  <span>Đóng</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-paper-sheet flex items-center">
              <div
                style={{
                  width: `${zoomPercent}%`,
                  minWidth: '520px',
                }}
                className="mx-auto transition-[width] duration-150"
              >
                <FigureSvgByVariant variant={figure.variant} detailedGrid={showDetailedGrid} />
              </div>
            </div>

            <div className="px-4 py-2.5 bg-paper border-t border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-ink-secondary">
              <span>{figure.hint}</span>
              <span className="tabular-figures text-[11px] text-ink-muted">
                Esc để đóng
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function ScientificFigureSpecimen() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [zoomPercent, setZoomPercent] = useState<100 | 125 | 150>(125)
  const [showDetailedGrid, setShowDetailedGrid] = useState(true)

  useEffect(() => {
    if (!isExpanded) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded])

  return (
    <>
      {/* Mẫu khung hình vẽ nằm trên bề mặt giấy đề ô ly 4mm */}
      <div className="question-oly-surface border border-rule rounded-[4px] overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Lề vở kẻ đôi đỏ bên trái như giấy kiểm tra */}
          <div className="hidden sm:flex sm:w-14 shrink-0 notebook-margin-double bg-paper-sheet flex-col items-center pt-5 pb-4 select-none">
            <span className="tabular-figures text-[11px] font-semibold text-pen-red tracking-tight border border-pen-red bg-pen-red-wash px-1.5 py-0.5 rounded-[2px]">
              C.18
            </span>
            <span className="tabular-figures text-[10px] text-ink-muted mt-2">4mm</span>
          </div>

          <div className="flex-1 p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-secondary">
                Ngữ cảnh áp dụng · Bề mặt tờ câu hỏi có lưới ô ly 4mm mờ
              </p>
              <span className="tabular-figures text-xs text-ink-muted">
                Tư duy Khoa học · Hoá lý thực nghiệm
              </span>
            </div>

            <p className="text-[15px] leading-[1.68] text-ink mb-4 max-w-[68ch]">
              Dựa vào đồ thị thực nghiệm <strong>Hình 2.4</strong> dưới đây, hãy xác định độ chênh lệch
              hiệu suất cân bằng <span className="tabular-figures text-[14px]">Δη = η(P₂) − η(P₁)</span> tại
              mốc nhiệt độ vận hành tối ưu <span className="tabular-figures text-[14px]">T* = 450 °C</span>.
            </p>

            {/* Bản thân thành phần Khung hình vẽ (Figure Plate) */}
            <figure className="bg-paper-sheet border border-rule rounded-[3px]">
              {/* Thanh tiêu đề khung hình + Nút "Phóng to" */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-paper border-b border-rule">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="tabular-figures text-xs font-semibold text-ink bg-paper-recessed border border-rule px-2 py-0.5 rounded-[2px] shrink-0">
                    HÌNH 2.4
                  </span>
                  <span className="text-xs sm:text-[13px] font-medium text-ink truncate">
                    Sự phụ thuộc hiệu suất cân bằng η (%) theo nhiệt độ T (°C)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsExpanded(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-pen-red hover:text-pen-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen-red rounded-[3px] transition-colors cursor-pointer shrink-0"
                  aria-haspopup="dialog"
                  aria-expanded={isExpanded}
                >
                  <IconExpand size={13} />
                  <span>Phóng to</span>
                </button>
              </div>

              {/* Vùng đồ thị vector */}
              <div className="p-3 sm:p-5 bg-paper-sheet">
                <CatalyticYieldPlot />
              </div>

              {/* Chú thích chân hình vẽ */}
              <figcaption className="px-3.5 py-2.5 bg-paper border-t border-rule flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs text-ink-secondary">
                <span>
                  Chú thích: Hỗn hợp khí đầu vào có tỷ lệ mol chuẩn{' '}
                  <span className="tabular-figures">1 : 3</span>; sai số phép đo{' '}
                  <span className="tabular-figures">±0,5%</span>.
                </span>
                <span className="tabular-figures text-[11px] text-ink-muted">
                  Tỷ lệ khung gốc 100% · Nhấn «Phóng to» để bật lưới chia 5%
                </span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>

      {/* Hộp thoại xem phóng to phẳng (Không làm mờ kính / Không đổ bóng) */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="figure-zoom-title"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-paper-sheet border border-ink rounded-[4px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Thanh điều khiển hộp thoại phóng to */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-paper border-b border-rule">
              <div className="flex items-center gap-2.5">
                <span className="tabular-figures text-xs font-semibold text-paper-sheet bg-ink px-2 py-0.5 rounded-[2px]">
                  HÌNH 2.4 · CHẾ ĐỘ TRA CỨU
                </span>
                <h4 id="figure-zoom-title" className="text-sm font-semibold text-ink">
                  Đồ thị hiệu suất cân bằng η (%) theo nhiệt độ T (°C)
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Bật / tắt lưới chia nhỏ 5% */}
                <button
                  type="button"
                  onClick={() => setShowDetailedGrid((prev) => !prev)}
                  className={`px-2.5 py-1 text-xs font-medium border rounded-[3px] cursor-pointer transition-colors ${
                    showDetailedGrid
                      ? 'bg-pen-red-wash border-pen-red text-pen-red'
                      : 'bg-paper-sheet border-rule text-ink-secondary hover:border-ink'
                  }`}
                >
                  Lưới phụ 5%: {showDetailedGrid ? 'Đang bật' : 'Tắt'}
                </button>

                {/* Chọn mức tỷ lệ */}
                <div
                  className="inline-flex border border-rule rounded-[3px] overflow-hidden bg-paper-sheet"
                  role="group"
                  aria-label="Mức phóng đại"
                >
                  {([100, 125, 150] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setZoomPercent(level)}
                      className={`tabular-figures px-2 py-1 text-xs font-medium cursor-pointer border-r last:border-r-0 border-rule transition-colors ${
                        zoomPercent === level
                          ? 'bg-ink text-paper-sheet'
                          : 'text-ink-secondary hover:bg-paper-recessed'
                      }`}
                    >
                      {level}%
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-pen-red hover:text-pen-red rounded-[3px] cursor-pointer"
                >
                  <IconCross size={12} />
                  <span>Thu nhỏ (Esc)</span>
                </button>
              </div>
            </div>

            {/* Khung cuộn xem đồ thị phóng lớn */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-paper-sheet">
              <div
                style={{
                  width: `${zoomPercent}%`,
                  minWidth: '540px',
                }}
                className="mx-auto transition-[width] duration-150"
              >
                <CatalyticYieldPlot detailedGrid={showDetailedGrid} />
              </div>
            </div>

            {/* Thanh đọc số liệu nhanh */}
            <div className="px-4 py-2.5 bg-paper border-t border-rule flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
              <span>
                Gợi ý đọc bảng chia độ tại <span className="tabular-figures font-semibold text-ink">T* = 450 °C</span>:{' '}
                <span className="tabular-figures text-pen-red font-medium">η(P₂) = 45%</span>,{' '}
                <span className="tabular-figures text-ink font-medium">η(P₁) = 30%</span>.
              </span>
              <span className="tabular-figures text-[11px] text-ink-muted">
                Phím tắt: nhấn Esc hoặc nhấp ra ngoài viền giấy để đóng
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
