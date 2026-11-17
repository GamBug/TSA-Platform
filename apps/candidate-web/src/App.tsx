import React, { useEffect, useMemo, useState } from 'react'
import { HomeScreen } from './components/HomeScreen'
import { QuestionScreen } from './components/QuestionScreen'
import { ResultScreen } from './components/ResultScreen'
import { SectionSwitcherScreen } from './components/SectionSwitcherScreen'
import { TopicCatalogScreen } from './components/TopicCatalogScreen'
import {
  FULL_QUESTION_BANK,
  READING_PASSAGES,
  SECTION_CONFIGS,
  TOPIC_CATALOG,
  buildInitialSimulationSample,
  getQuestionsForSection,
  getQuestionsForTopic,
} from './data/tsaContent'
import type {
  CatalogFetchState,
  QuestionItem,
  ScreenId,
  SectionClockState,
  SectionId,
  TopicEntry,
  UserAnswer,
} from './types/tsa'

const SCREEN_TABS: Array<{ id: ScreenId; num: string; label: string }> = [
  { id: 'home', num: '1', label: 'Chọn chế độ' },
  { id: 'catalog', num: '2', label: 'Mục lục chủ đề' },
  { id: 'question', num: '3', label: 'Làm bài' },
  { id: 'sections', num: '4', label: 'Chuyển phần thi' },
  { id: 'result', num: '5', label: 'Kết quả' },
]

export default function App() {
  const initialSim = useMemo(() => buildInitialSimulationSample(), [])

  const [screen, setScreen] = useState<ScreenId>('home')
  const [practiceMode, setPracticeMode] = useState<'topic' | 'simulation'>('simulation')

  // Trạng thái Mục lục chủ đề (Screen 2)
  const [catalogFilter, setCatalogFilter] = useState<SectionId | 'all'>('all')
  const [catalogFetchState, setCatalogFetchState] = useState<CatalogFetchState>('ready')
  const [selectedEmptyTopic, setSelectedEmptyTopic] = useState<TopicEntry | null>(null)
  const [activeTopic, setActiveTopic] = useState<TopicEntry>(TOPIC_CATALOG[0])

  // Trạng thái Bài làm & Chấm điểm (Screen 3, 4, 5)
  const [activeSection, setActiveSection] = useState<SectionId>('math')
  const [questionIndex, setQuestionIndex] = useState<number>(0)
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>(initialSim.answers)
  const [flagged, setFlagged] = useState<Record<string, boolean>>(initialSim.flagged)
  const [isGradedReview, setIsGradedReview] = useState<boolean>(false)

  // Trạng thái lưu bài tự động
  const [isSavingNow, setIsSavingNow] = useState<boolean>(false)
  const [savedTimestamp, setSavedTimestamp] = useState<string | null>('14:22')

  // Đồng hồ từng phần thi giả lập: Toán bình thường (>5p), Đọc hiểu (<5p), Khoa học (Khoá/Hết giờ mẫu)
  const [sectionClocks, setSectionClocks] = useState<Record<SectionId, SectionClockState>>({
    math: { remainingSeconds: 42 * 60 + 18, status: 'active' },
    reading: { remainingSeconds: 4 * 60 + 36, status: 'active' },
    science: { remainingSeconds: 0, status: 'expired' },
  })

  useEffect(() => {
    document.documentElement.lang = 'vi'
    document.title = 'TSA Practice — Luyện tập đánh giá tư duy'
  }, [])

  // Đếm ngược mỗi giây cho phần thi đang mở khi ở màn hình Làm bài hoặc Chuyển phần
  useEffect(() => {
    if (practiceMode !== 'simulation' || isGradedReview) return
    if (screen !== 'question' && screen !== 'sections') return

    const interval = window.setInterval(() => {
      setSectionClocks((prev) => {
        const current = prev[activeSection]
        if (current.status !== 'active' || current.remainingSeconds <= 0) return prev
        const nextSec = current.remainingSeconds - 1
        return {
          ...prev,
          [activeSection]: {
            remainingSeconds: nextSec,
            status: nextSec <= 0 ? 'expired' : 'active',
          },
        }
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [practiceMode, isGradedReview, screen, activeSection])

  const activeQuestions: QuestionItem[] = useMemo(() => {
    if (practiceMode === 'topic') {
      return getQuestionsForTopic(activeTopic.id)
    }
    return getQuestionsForSection(activeSection)
  }, [practiceMode, activeTopic.id, activeSection])

  const activeClock = sectionClocks[activeSection]
  const isCurrentSectionLocked =
    practiceMode === 'simulation' &&
    (activeClock.status !== 'active' || activeClock.remainingSeconds <= 0)

  const handleChangeAnswer = (questionId: string, answer: UserAnswer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
    setIsSavingNow(true)
    window.setTimeout(() => {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      setSavedTimestamp(`${hh}:${mm}`)
      setIsSavingNow(false)
    }, 220)
  }

  const handleToggleFlag = (questionId: string) => {
    setFlagged((prev) => ({ ...prev, [questionId]: !prev[questionId] }))
  }

  const handleOpenCatalog = (initialFilter: SectionId | 'all' = 'all') => {
    setCatalogFilter(initialFilter)
    setSelectedEmptyTopic(null)
    setCatalogFetchState('ready')
    setScreen('catalog')
  }

  const handleSelectTopic = (topic: TopicEntry) => {
    if (topic.questionCount === 0) {
      setSelectedEmptyTopic(topic)
      return
    }
    setSelectedEmptyTopic(null)
    setPracticeMode('topic')
    setActiveTopic(topic)
    setActiveSection(topic.section)
    setIsGradedReview(false)
    setQuestionIndex(0)
    setScreen('question')
  }

  const handleStartFullSimulation = () => {
    setPracticeMode('simulation')
    setIsGradedReview(false)
    setSectionClocks({
      math: { remainingSeconds: 42 * 60 + 18, status: 'active' },
      reading: { remainingSeconds: 4 * 60 + 36, status: 'active' },
      science: { remainingSeconds: 56 * 60 + 40, status: 'active' },
    })
    setActiveSection('math')
    setQuestionIndex(0)
    setScreen('question')
  }

  const handleEnterSection = (secId: SectionId) => {
    setPracticeMode('simulation')
    setIsGradedReview(false)
    setActiveSection(secId)
    setQuestionIndex(0)
    setScreen('question')
  }

  const handleLockSection = (secId: SectionId) => {
    setSectionClocks((prev) => ({
      ...prev,
      [secId]: { ...prev[secId], status: 'finished' },
    }))
  }

  const handleReopenDemoSection = (secId: SectionId) => {
    const defaults: Record<SectionId, number> = {
      math: 42 * 60 + 18,
      reading: 4 * 60 + 36,
      science: 56 * 60 + 40,
    }
    setSectionClocks((prev) => ({
      ...prev,
      [secId]: { remainingSeconds: defaults[secId], status: 'active' },
    }))
  }

  const handleSetDemoTimerState = (state: 'normal' | 'under5' | 'expired') => {
    setSectionClocks((prev) => {
      if (state === 'normal') {
        return { ...prev, [activeSection]: { remainingSeconds: 38 * 60 + 15, status: 'active' } }
      }
      if (state === 'under5') {
        return { ...prev, [activeSection]: { remainingSeconds: 4 * 60 + 12, status: 'active' } }
      }
      return { ...prev, [activeSection]: { remainingSeconds: 0, status: 'expired' } }
    })
  }

  const handleReviewQuestion = (question: QuestionItem) => {
    setIsGradedReview(true)
    if (practiceMode === 'topic') {
      const list = getQuestionsForTopic(activeTopic.id)
      const idx = list.findIndex((q) => q.id === question.id)
      if (idx >= 0) {
        setQuestionIndex(idx)
        setScreen('question')
        return
      }
    }
    setPracticeMode('simulation')
    setActiveSection(question.section)
    const secList = getQuestionsForSection(question.section)
    const idx = secList.findIndex((q) => q.id === question.id)
    setQuestionIndex(idx >= 0 ? idx : 0)
    setScreen('question')
  }

  const activeSectionConfig =
    SECTION_CONFIGS.find((s) => s.id === activeSection) ?? SECTION_CONFIGS[0]

  const resultQuestions =
    practiceMode === 'topic' ? getQuestionsForTopic(activeTopic.id) : FULL_QUESTION_BANK

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* KHUNG CHÍNH 1440PX TRÊN DESKTOP / TRÀN GỌN 390PX TRÊN DI ĐỘNG */}
      <div className="max-w-[1440px] mx-auto border-x border-rule min-h-screen flex flex-col bg-paper">
        {/* THANH ĐẦU TRANG VỞ & CHUYỂN MÀN HÌNH */}
        <header className="border-b border-ink bg-paper px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setScreen('home')}
              className="flex items-center gap-2 min-h-[44px] px-1 text-left cursor-pointer"
            >
              <span className="font-display text-base sm:text-lg font-bold tracking-tight text-ink">
                TSA Practice
              </span>
            </button>
            <span className="hidden md:inline-block text-xs text-ink-muted border-l border-rule pl-3">
              Bản luyện tập không chính thức
            </span>
          </div>

          {/* Điều hướng 5 màn hình để chuyển nhanh trên cả 1440px và 390px */}
          <nav
            aria-label="Điều hướng các màn hình luyện tập"
            className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5 sm:pb-0"
          >
            {SCREEN_TABS.map((tab) => {
              const isCurrent = screen === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScreen(tab.id)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`px-2.5 sm:px-3 min-h-[44px] text-xs font-semibold border rounded-[3px] whitespace-nowrap cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-ink text-paper-sheet border-ink'
                      : 'bg-paper-sheet text-ink-secondary border-rule hover:border-ink hover:text-ink'
                  }`}
                >
                  <span className="tabular-figures mr-1">{tab.num}.</span>
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </header>

        {/* NỘI DUNG MÀN HÌNH ĐANG HIỂN THỊ */}
        <main className="flex-1">
          {screen === 'home' && (
            <HomeScreen
              onOpenCatalog={handleOpenCatalog}
              onStartFullSimulation={handleStartFullSimulation}
              onOpenSectionSwitcher={() => {
                setPracticeMode('simulation')
                setScreen('sections')
              }}
            />
          )}

          {screen === 'catalog' && (
            <TopicCatalogScreen
              topics={TOPIC_CATALOG}
              sectionFilter={catalogFilter}
              onChangeFilter={setCatalogFilter}
              fetchState={catalogFetchState}
              onSetFetchState={setCatalogFetchState}
              selectedEmptyTopic={selectedEmptyTopic}
              onSelectTopic={handleSelectTopic}
              onClearEmptyTopic={() => setSelectedEmptyTopic(null)}
              onBackHome={() => setScreen('home')}
            />
          )}

          {screen === 'question' && (
            <QuestionScreen
              mode={practiceMode}
              headerLabel={
                practiceMode === 'topic'
                  ? `Chuyên đề ${activeTopic.orderNumber} · ${activeTopic.title}`
                  : `Thi thử 100 câu · ${activeSectionConfig.title}`
              }
              sectionId={activeSection}
              questions={activeQuestions}
              currentIndex={Math.min(questionIndex, Math.max(0, activeQuestions.length - 1))}
              onSelectIndex={setQuestionIndex}
              passages={READING_PASSAGES}
              answers={answers}
              onChangeAnswer={handleChangeAnswer}
              flagged={flagged}
              onToggleFlag={handleToggleFlag}
              remainingSeconds={activeClock.remainingSeconds}
              isLocked={isCurrentSectionLocked}
              isGradedReview={isGradedReview}
              savedTimestamp={savedTimestamp}
              isSavingNow={isSavingNow}
              onBackToCatalogOrSections={() =>
                setScreen(practiceMode === 'simulation' ? 'sections' : 'catalog')
              }
              onFinishOrSubmit={() => {
                if (isGradedReview) {
                  setScreen('result')
                } else if (practiceMode === 'simulation') {
                  setScreen('sections')
                } else {
                  setIsGradedReview(true)
                  setScreen('result')
                }
              }}
              onSetDemoTimerState={handleSetDemoTimerState}
            />
          )}

          {screen === 'sections' && (
            <SectionSwitcherScreen
              sections={SECTION_CONFIGS}
              sectionClocks={sectionClocks}
              activeSection={activeSection}
              answers={answers}
              flagged={flagged}
              onEnterSection={handleEnterSection}
              onLockSection={handleLockSection}
              onReopenDemoSection={handleReopenDemoSection}
              onSubmitFullSimulation={() => {
                setPracticeMode('simulation')
                setIsGradedReview(true)
                setScreen('result')
              }}
              onBackHome={() => setScreen('home')}
            />
          )}

          {screen === 'result' && (
            <ResultScreen
              title={
                practiceMode === 'topic'
                  ? `Tổng kết chuyên đề ${activeTopic.orderNumber}: ${activeTopic.title}`
                  : 'Tổng kết bài thi thử đầy đủ (100 câu)'
              }
              subtitle={
                practiceMode === 'topic'
                  ? 'Thống kê số câu đúng ở chuyên đề vừa luyện. Nhấn «Xem lời giải» để mở lại từng câu trên giấy ô ly.'
                  : 'Số câu làm đúng theo từng phần thi (Toán / Đọc hiểu / Khoa học) được ghi nhận độc lập như phiếu chấm bút đỏ.'
              }
              questions={resultQuestions}
              answers={answers}
              flagged={flagged}
              onReviewQuestion={handleReviewQuestion}
              onBackHome={() => setScreen('home')}
            />
          )}
        </main>

        {/* CHÂN TRANG ĐƠN GIẢN */}
        <footer className="border-t border-rule bg-paper-recessed px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ink-secondary">
          <span>
            TSA Practice — Bản luyện tập không chính thức dành cho học sinh THPT tự ôn tập.
          </span>
          <span className="tabular-figures text-[11px] text-ink-muted">
            Phím tắt khi làm bài: A–D chọn · N câu sau · F đánh dấu
          </span>
        </footer>
      </div>
    </div>
  )
}
