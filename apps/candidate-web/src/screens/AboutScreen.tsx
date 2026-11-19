import React from 'react'
import { buttonClass, DemoNoticePanel } from '@/ui/Shell'

export function AboutScreen() {
  return (
    <main className="flex-1 grid grid-cols-1 lg:grid-cols-[176px_1fr]">
      <div className="hidden lg:block notebook-margin-lg px-5 py-10 text-xs font-semibold text-ink-secondary">Giới thiệu</div>
      <section className="px-5 py-10 sm:px-10 sm:py-14 max-w-[760px]" data-testid="about">
        <h1 tabIndex={-1} className="font-display text-[32px] sm:text-[44px] leading-[1.1] font-semibold text-ink tracking-[-0.02em]">Về trang luyện tập này</h1>
        <div className="mt-6 space-y-4 text-[16px] leading-[1.68] text-ink-secondary max-w-[62ch]">
          <p>TSA Practice là trang luyện tập <strong className="text-ink">không chính thức</strong> cho học sinh THPT tự ôn bài đánh giá tư duy. Trang <strong className="text-ink">không liên kết với Đại học Bách khoa Hà Nội (HUST)</strong> và không phải là bài thi thật.</p>
          <p>Điểm hiển thị chỉ là số câu đúng trong từng phần và tổng cộng. Đó <strong className="text-ink">không phải điểm chính thức</strong> và không tương đương với thang điểm của kỳ thi thật.</p>
          <p>Đây là dự án phi lợi nhuận: không quảng cáo, không thu phí, không bán dữ liệu.</p>
          <p>Mỗi trình duyệt nhận một phiên khách tạm thời. Trang không yêu cầu tên, email hay thông tin cá nhân. Bài làm chỉ phục vụ việc chấm và xem lại trong phiên, không được lưu lâu dài và sẽ bị xóa khi máy chủ khởi động lại.</p>
        </div>
        <div className="mt-8"><DemoNoticePanel /></div>
        <p className="mt-8"><a href="/student/" className={buttonClass.secondary} data-testid="about-back">Quay lại trang luyện tập</a></p>
      </section>
    </main>
  )
}
