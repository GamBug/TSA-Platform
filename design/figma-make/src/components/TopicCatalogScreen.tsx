import React from 'react'
import type { CatalogFetchState, SectionId, TopicEntry } from '../types/tsa'
import { IconAlert, IconArrowLeft, IconRefresh } from './Icons'

interface TopicCatalogScreenProps {
  topics: TopicEntry[]
  sectionFilter: SectionId | 'all'
  onChangeFilter: (filter: SectionId | 'all') => void
  fetchState: CatalogFetchState
  onSetFetchState: (state: CatalogFetchState) => void
  selectedEmptyTopic: TopicEntry | null
  onSelectTopic: (topic: TopicEntry) => void
  onClearEmptyTopic: () => void
  onBackHome: () => void
}

const FILTER_TABS: Array<{ id: SectionId | 'all'; label: string }> = [
  { id: 'all', label: 'Tất cả phần' },
  { id: 'math', label: 'Toán học' },
  { id: 'reading', label: 'Đọc hiểu' },
  { id: 'science', label: 'Khoa học' },
]

function sectionTagLabel(section: SectionId): string {
  if (section === 'math') return 'Toán'
  if (section === 'reading') return 'Đọc hiểu'
  return 'Khoa học'
}

export function TopicCatalogScreen({
  topics,
  sectionFilter,
  onChangeFilter,
  fetchState,
  onSetFetchState,
  selectedEmptyTopic,
  onSelectTopic,
  onClearEmptyTopic,
  onBackHome,
}: TopicCatalogScreenProps) {
  const filteredTopics =
    sectionFilter === 'all'
      ? topics
      : topics.filter((t) => t.section === sectionFilter)

  const totalAvailableQuestions = filteredTopics.reduce((acc, t) => acc + t.questionCount, 0)

  return (
    <div className="bg-paper">
      <div className="grid grid-cols-1 lg:grid-cols-[176px_1fr]">
        {/* Cột lề trái kiểu mục lục vở ghi chép */}
        <div className="px-5 py-5 lg:py-8 border-b lg:border-b-0 border-rule notebook-margin-lg flex lg:flex-col justify-between lg:justify-start gap-2">
          <div>
            <span className="text-xs font-semibold text-ink-secondary block">Trang 02 · Mục lục</span>
            <span className="text-xs text-ink-secondary mt-1 block">
              {filteredTopics.length} chuyên đề · {totalAvailableQuestions} câu
            </span>
          </div>
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer self-start lg:mt-4"
          >
            <IconArrowLeft size={13} />
            <span>Về chọn chế độ</span>
          </button>
        </div>

        {/* Khung mục lục vở chính */}
        <div className="p-5 sm:p-8 lg:p-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-rule">
            <div>
              <p className="text-xs font-semibold text-ink-secondary mb-1.5">
                Luyện theo chủ đề
              </p>
              <h1 className="font-display text-[28px] leading-[1.2] font-semibold text-ink">
                Mục lục chuyên đề ôn tập
              </h1>
            </div>

            {/* Bộ lọc theo phần thi */}
            <div
              className="flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="Lọc chuyên đề theo phần thi"
            >
              {FILTER_TABS.map((tab) => {
                const isActive = sectionFilter === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      onClearEmptyTopic()
                      onChangeFilter(tab.id)
                    }}
                    className={`px-3.5 min-h-[44px] text-xs font-semibold border rounded-[3px] cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-ink text-paper-sheet border-ink'
                        : 'bg-paper-sheet text-ink-secondary border-rule-strong hover:border-ink hover:text-ink'
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Liên kết xem trạng thái mẫu — để ở dạng chữ mờ, không cạnh tranh với mục lục */}
          <div className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-ink-muted">
            <span>Xem trạng thái mẫu:</span>
            <div className="flex flex-wrap">
              <button
                type="button"
                onClick={() => {
                  onClearEmptyTopic()
                  onSetFetchState('ready')
                }}
                aria-pressed={fetchState === 'ready' && !selectedEmptyTopic}
                className={`px-2 min-h-[44px] text-xs underline underline-offset-2 cursor-pointer ${
                  fetchState === 'ready' && !selectedEmptyTopic ? 'text-ink font-semibold' : 'text-ink-muted hover:text-ink'
                }`}
              >
                Bình thường
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearEmptyTopic()
                  onSetFetchState('loading')
                }}
                aria-pressed={fetchState === 'loading'}
                className={`px-2 min-h-[44px] text-xs underline underline-offset-2 cursor-pointer ${
                  fetchState === 'loading' ? 'text-ink font-semibold' : 'text-ink-muted hover:text-ink'
                }`}
              >
                Đang tải
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearEmptyTopic()
                  onSetFetchState('error')
                }}
                aria-pressed={fetchState === 'error'}
                className={`px-2 min-h-[44px] text-xs underline underline-offset-2 cursor-pointer ${
                  fetchState === 'error' ? 'text-ink font-semibold' : 'text-ink-muted hover:text-ink'
                }`}
              >
                Lỗi mạng
              </button>
            </div>
          </div>

          {/* TRẠNG THÁI 1: ĐANG TẢI (LOADING) */}
          {fetchState === 'loading' && (
            <div
              className="mt-6 border border-rule bg-paper-sheet rounded-[4px] p-5 sm:p-6"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-rule">
                <span className="text-sm font-semibold text-ink">
                  Đang mở mục lục chuyên đề...
                </span>
                <span className="tabular-figures text-xs text-ink-muted">Đang đồng bộ danh mục</span>
              </div>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="flex items-center gap-3">
                    <span className="w-8 h-5 bg-paper-recessed rounded-[2px] shrink-0" />
                    <span className="h-5 bg-paper-recessed rounded-[2px] w-48 sm:w-80" />
                    <span className="flex-1 border-b border-dotted border-rule-strong" />
                    <span className="w-16 h-5 bg-paper-recessed rounded-[2px] shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TRẠNG THÁI 2: LỖI MẠNG KÈM NÚT THỬ LẠI (NETWORK ERROR WITH RETRY) */}
          {fetchState === 'error' && (
            <div
              className="mt-6 border border-pen-red bg-pen-red-wash rounded-[4px] p-6"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <IconAlert size={18} className="text-pen-red shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h2 className="font-display text-[20px] font-semibold text-ink">
                    Không thể tải danh sách chuyên đề
                  </h2>
                  <p className="mt-1.5 text-sm leading-[1.6] text-ink-secondary max-w-[56ch]">
                    Kết nối tới kho đề luyện bị gián đoạn tạm thời. Các bài đã lưu trước đó trên
                    máy vẫn được giữ nguyên. Vui lòng kiểm tra lại mạng và thử tải lại mục lục.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSetFetchState('loading')
                        window.setTimeout(() => onSetFetchState('ready'), 350)
                      }}
                      className="inline-flex items-center gap-2 px-4 min-h-[44px] text-xs font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer"
                    >
                      <IconRefresh size={14} />
                      <span>Thử lại</span>
                    </button>
                    <button
                      type="button"
                      onClick={onBackHome}
                      className="inline-flex items-center gap-2 px-4 min-h-[44px] text-xs font-semibold text-ink bg-paper-sheet border border-rule-strong hover:border-ink rounded-[3px] cursor-pointer"
                    >
                      <span>Quay về trang chọn chế độ</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TRẠNG THÁI 3: CHỦ ĐỀ TRỐNG (EMPTY TOPIC) */}
          {fetchState === 'ready' && selectedEmptyTopic && (
            <div className="mt-6 border border-rule-strong bg-paper-sheet rounded-[4px] p-6 sm:p-8">
              <div>
                <div>
                  <span className="tabular-figures text-xs font-semibold text-ink bg-ochre-wash border border-ochre px-2 py-0.5 rounded-[2px]">
                    CHỦ ĐỀ {selectedEmptyTopic.orderNumber} · 0 CÂU HỎI
                  </span>
                  <h2 className="mt-2 font-display text-[20px] leading-[1.35] font-semibold text-ink">
                    {selectedEmptyTopic.title}
                  </h2>
                  <p className="mt-2 text-sm leading-[1.6] text-ink-secondary max-w-[58ch]">
                    Chuyên đề này hiện chưa có câu hỏi nào được phát hành trong ngân hàng luyện tập
                    (đang biên soạn và hiệu đính đáp án). Bạn hãy chọn một chuyên đề khác đã hoàn
                    thiện để bắt đầu làm bài.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={onClearEmptyTopic}
                      className="inline-flex items-center gap-2 px-4 min-h-[44px] text-xs font-semibold bg-pen-red text-paper-sheet border border-pen-red hover:bg-pen-red-hover rounded-[3px] cursor-pointer"
                    >
                      <IconArrowLeft size={14} />
                      <span>Quay lại mục lục chuyên đề</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TRẠNG THÁI 4: MỤC LỤC KIỂU VỞ HỌC SINH VỚI ĐƯỜNG CHẤM NỐI (DOTTED LEADER LINE) */}
          {fetchState === 'ready' && !selectedEmptyTopic && (
            <div className="mt-6 border border-rule bg-paper-sheet rounded-[4px] overflow-hidden">
              <div className="px-4 sm:px-6 py-3 bg-paper border-b border-rule flex items-center justify-between text-xs font-semibold text-ink-secondary">
                <span>Số TT · Tên chuyên đề</span>
                <span>Số lượng câu hỏi</span>
              </div>

              <ul className="divide-y divide-rule">
                {filteredTopics.map((topic) => {
                  const isEmpty = topic.questionCount === 0
                  return (
                    <li key={topic.id}>
                      <button
                        type="button"
                        onClick={() => onSelectTopic(topic)}
                        className="w-full text-left px-4 sm:px-6 py-4 min-h-[56px] hover:bg-paper transition-colors cursor-pointer group block"
                      >
                        {/* Hàng chính: Số · Tên · Đường chấm nối · Số câu */}
                        <div className="flex items-baseline gap-2.5 sm:gap-3">
                          <span className="tabular-figures text-xs sm:text-sm font-bold text-ink-secondary shrink-0">
                            {topic.orderNumber}.
                          </span>

                          <span className="text-[15px] sm:text-base font-semibold text-ink group-hover:underline underline-offset-4">
                            {topic.title}
                          </span>

                          {/* Đường chấm nối kiểu mục lục sách / vở */}
                          <span
                            aria-hidden="true"
                            className="hidden sm:block flex-1 border-b border-dotted border-rule-strong mx-1 translate-y-[-3px]"
                          />

                          <span
                            className={`tabular-figures text-xs sm:text-sm font-semibold shrink-0 ml-auto sm:ml-0 ${
                              isEmpty ? 'text-ink-muted' : 'text-ink'
                            }`}
                          >
                            {topic.questionCount} câu
                          </span>
                        </div>

                        {/* Dòng phụ mô tả & nhãn phần */}
                        <div className="mt-1.5 pl-6 sm:pl-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
                          <span className="px-1.5 py-0.5 bg-paper border border-rule rounded-[2px] text-[11px] font-medium text-ink">
                            {sectionTagLabel(topic.section)}
                          </span>
                          <span>{topic.subtitle}</span>
                          {isEmpty && (
                            <span className="text-ink font-medium">· Chưa có câu hỏi</span>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
