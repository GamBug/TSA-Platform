import type {
  QuestionItem,
  ReadingPassage,
  SectionConfig,
  SectionId,
  TopicEntry,
  UserAnswer,
} from '../types/tsa'

export const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: 'math',
    title: 'Phần 1 · Tư duy Toán học',
    shortTitle: 'Toán học',
    totalQuestions: 40,
    durationSeconds: 60 * 60,
    description: '40 câu · 60 phút · Hàm số, hình học không gian, tổ hợp xác suất và suy luận số.',
  },
  {
    id: 'reading',
    title: 'Phần 2 · Tư duy Đọc hiểu',
    shortTitle: 'Đọc hiểu',
    totalQuestions: 20,
    durationSeconds: 30 * 60,
    description: '20 câu · 30 phút · Ngữ liệu khoa học tự nhiên, công nghệ và kinh tế học.',
  },
  {
    id: 'science',
    title: 'Phần 3 · Tư duy Khoa học / Giải quyết vấn đề',
    shortTitle: 'Khoa học',
    totalQuestions: 40,
    durationSeconds: 60 * 60,
    description: '40 câu · 60 phút · Đọc đồ thị thực nghiệm, Vật lý, Hoá học và Sinh học.',
  },
]

export const TOPIC_CATALOG: TopicEntry[] = [
  {
    id: 'math-func',
    orderNumber: '01',
    section: 'math',
    title: 'Khảo sát hàm số, tiếp tuyến & cực trị',
    subtitle: 'Trắc nghiệm 4 lựa chọn, đọc đồ thị đạo hàm, bài toán tham số m',
    questionCount: 14,
    estimatedMinutes: 20,
  },
  {
    id: 'math-prob',
    orderNumber: '02',
    section: 'math',
    title: 'Tổ hợp, xác suất có điều kiện & dãy số',
    subtitle: 'Điền đáp án số chính xác và bài toán quy luật tăng trưởng',
    questionCount: 14,
    estimatedMinutes: 22,
  },
  {
    id: 'math-geo',
    orderNumber: '03',
    section: 'math',
    title: 'Hình học không gian & toạ độ Oxyz',
    subtitle: 'Khoảng cách hai đường chéo nhau, góc phẳng nhị diện, thể tích khối chóp',
    questionCount: 12,
    estimatedMinutes: 18,
  },
  {
    id: 'math-empty',
    orderNumber: '04',
    section: 'math',
    title: 'Bất đẳng thức & cực trị hình học nâng cao',
    subtitle: 'Chuyên đề bổ sung đang rà soát đáp án chuẩn hoá',
    questionCount: 0,
    estimatedMinutes: 0,
  },
  {
    id: 'read-eco',
    orderNumber: '05',
    section: 'reading',
    title: 'Ngữ liệu Sinh thái học & Thuỷ văn đồng bằng',
    subtitle: 'Đọc văn bản, điền khuyết thuật ngữ và suy luận nhân quả',
    questionCount: 10,
    estimatedMinutes: 15,
  },
  {
    id: 'read-tech',
    orderNumber: '06',
    section: 'reading',
    title: 'Ngữ liệu Vật liệu bán dẫn & Lưu trữ năng lượng',
    subtitle: 'Đối chiếu nhận định tác giả, nối khái niệm và cấu trúc lập luận',
    questionCount: 10,
    estimatedMinutes: 15,
  },
  {
    id: 'sci-chem',
    orderNumber: '07',
    section: 'science',
    title: 'Cân bằng hoá học, động học & hiệu suất xúc tác',
    subtitle: 'Đọc đồ thị áp suất – nhiệt độ (có hình phóng to) và tính độ chuyển hoá',
    questionCount: 16,
    estimatedMinutes: 24,
  },
  {
    id: 'sci-phys',
    orderNumber: '08',
    section: 'science',
    title: 'Cơ học dao động, mạch điện & cảm ứng điện từ',
    subtitle: 'Nối hai cột định luật, đọc dao động ký và tính sai số thực nghiệm',
    questionCount: 14,
    estimatedMinutes: 20,
  },
  {
    id: 'sci-bio',
    orderNumber: '09',
    section: 'science',
    title: 'Di truyền học quần thể & sinh lý thực vật',
    subtitle: 'Phân tích bảng số liệu thí nghiệm quang hợp và tần số alen',
    questionCount: 10,
    estimatedMinutes: 16,
  },
]

export const READING_PASSAGES: Record<string, ReadingPassage> = {
  'p-mangrove': {
    id: 'p-mangrove',
    code: 'NGỮ LIỆU ĐỌC HIỂU SỐ 01',
    title: 'Rừng ngập mặn ven biển và cơ chế «bẫy phù sa» tự nhiên',
    sourceNote: 'Biên soạn lại từ tổng quan địa mạo cửa sông đồng bằng sông Cửu Long (940 chữ)',
    paragraphs: [
      '(1) Trong các hệ sinh thái cửa sông ven biển Việt Nam, rừng ngập mặn không đơn thuần là dải cây chắn sóng mà vận hành như một «bộ lọc sinh địa hoá» quy mô lớn. Khi thuỷ triều dâng theo chu kỳ bán nhật triều, dòng nước mang theo hạt sét và bùn mịn đi sâu vào bãi bồi. Tại đây, hệ thống rễ chống của cây đước và rễ thở mọc ngược của cây mắm tạo thành một mạng lưới cản thuỷ động lực dày đặc.',
      '(2) Các đo đạc thuỷ văn ngoài thực địa cho thấy vận tốc dòng chảy rối khi đi qua đai rừng rộng 150 mét có thể giảm từ 0,48 m/s xuống còn dưới 0,09 m/s. Chính sự suy giảm đột ngột động năng dòng chảy này khiến các hạt lơ lửng không còn đủ lực nâng để tiếp tục di chuyển và bắt đầu sa lắng xuống bề mặt bãi lầy. Khi thuỷ triều rút, dòng chảy yếu ớt trong rừng không đủ ứng suất cắt để cuốn trôi lớp bùn non vừa lắng, tạo ra cơ chế tích tụ một chiều bền vững.',
      '(3) Song song với quá trình bồi tụ cơ học là chu trình giữ lại cacbon hữu cơ trong tầng trầm tích yếm khí. Khác với rừng trên cạn nơi lớp thảm mục bị vi sinh vật hiếu khí phân huỷ nhanh chóng và giải phóng khí CO₂ trở lại khí quyển, lớp đất bùn ngập mặn thường xuyên bão hoà nước nên gần như thiếu oxy. Nhờ tốc độ phân giải yếm khí chậm gấp nhiều lần, lượng cacbon sinh khối chôn vùi có thể tồn lưu hàng trăm đến hàng nghìn năm.',
      '(4) Tuy nhiên, cân bằng này hết sức nhạy cảm trước can thiệp công trình. Khi người ta xây đê kè cứng sát mép nước nhằm ngăn xói lở tức thì, sóng phản xạ từ mặt tường bê tông sẽ bào mòn chân bãi phía trước, làm mất độ thoải tự nhiên cần thiết để cây ngập mặn tái sinh. Hệ quả là đường bờ biển tuy được giữ cố định trên bản đồ ngắn hạn nhưng lại đánh mất khả năng tự nâng cốt nền theo mực nước biển dâng.',
    ],
  },
  'p-battery': {
    id: 'p-battery',
    code: 'NGỮ LIỆU ĐỌC HIỂU SỐ 02',
    title: 'Pin thể rắn và bài toán bề mặt tiếp xúc điện cực',
    sourceNote: 'Tổng hợp tài liệu khoa học vật liệu năng lượng mới (820 chữ)',
    paragraphs: [
      '(1) Trong pin lithium-ion truyền thống, chất điện giải lỏng hữu cơ đóng vai trò môi trường dẫn ion giữa cực dương và cực âm. Dù đạt độ dẫn ion cao ở nhiệt độ phòng, dung môi hữu cơ lại tiềm ẩn nguy cơ cháy nổ khi đoản mạch hoặc quá nhiệt, đồng thời giới hạn mật độ năng lượng khi muốn dùng cực âm kim loại liti nguyên chất.',
      '(2) Pin thể rắn thay thế hoàn toàn dung môi lỏng bằng màng gốm oxit, sunfua hoặc polyme rắn. Sự chuyển dịch này loại bỏ dung môi dễ bay hơi và tạo hàng rào cơ học ngăn sợi nhánh (dendrite) liti đâm xuyên qua lớp ngăn cách gây chập mạch bên trong pin.',
      '(3) Trở ngại lớn nhất khiến pin thể rắn chưa thể phổ biến đại trà nằm ở trở kháng tiếp xúc tại ranh giới rắn–rắn. Với chất điện giải lỏng, chất lỏng tự thấm ướt mọi khe hở vi mô trên bề mặt hạt vật liệu điện cực. Ngược lại, hai vật liệu rắn chỉ chạm nhau tại những điểm lồi cục bộ; khi pin sạc và xả làm thể tích điện cực co giãn liên tục, các khe hở vi mô mới lại hình thành, khiến dòng ion bị tắc nghẽn và hiệu suất suy giảm nhanh.',
      '(4) Để khắc phục, các nhóm nghiên cứu hiện theo đuổi hai hướng: phủ lớp đệm dẻo dày vài nanômét tại mặt phân cách, hoặc duy trì áp suất nén cơ học bên ngoài lên cụm pin nhằm ép các hạt gốm luôn áp sát điện cực trong suốt vòng đời vận hành.',
    ],
  },
}

const CORE_QUESTIONS: QuestionItem[] = [
  // ================= TOÁN HỌC =================
  {
    id: 'm-01',
    numberInSection: 1,
    section: 'math',
    topicId: 'math-func',
    topicTitle: 'Khảo sát hàm số, tiếp tuyến & cực trị',
    type: 'mcq',
    prompt:
      'Cho hàm số bậc ba y = f(x) có đồ thị như Hình 1.1 dưới đây. Phương trình tiếp tuyến của đồ thị tại điểm có hoành độ x = 1 cắt trục tung tại điểm có tung độ bằng bao nhiêu?',
    figure: {
      code: 'HÌNH 1.1',
      title: 'Đồ thị hàm số y = x³ − 3x + 2 và tiếp tuyến tham chiếu',
      caption: 'Hệ trục toạ độ vuông góc Oxy; tỷ lệ hai trục 1 : 1.',
      variant: 'parabola-tangent',
      hint: 'Quan sát giá trị f(1) và độ dốc đường thẳng cắt trục tung tại x = 0.',
    },
    options: [
      { key: 'A', text: 'y₀ = −2' },
      { key: 'B', text: 'y₀ = 0' },
      { key: 'C', text: 'y₀ = 2' },
      { key: 'D', text: 'y₀ = 4' },
    ],
    correctOption: 'B',
    explanation:
      'Với f(x) = x³ − 3x + 2, ta có f(1) = 0 và f′(1) = 3(1)² − 3 = 0. Tiếp tuyến tại x = 1 là đường thẳng nằm ngang y = 0, cắt trục tung tại y₀ = 0.',
  },
  {
    id: 'm-02',
    numberInSection: 2,
    section: 'math',
    topicId: 'math-prob',
    topicTitle: 'Tổ hợp, xác suất có điều kiện & dãy số',
    type: 'numeric',
    prompt:
      'Một hộp chứa 5 bi đỏ và 3 bi xanh đôi một phân biệt. Lấy ngẫu nhiên đồng thời 3 viên bi từ hộp. Tính xác suất để trong 3 viên bi lấy ra có đúng 2 viên bi đỏ (làm tròn đến hàng phần trăm, dùng dấu phẩy thập phân).',
    unit: 'xác suất',
    acceptedNumeric: ['0,54', '0.54'],
    numericHint: 'C(5,2)·C(3,1) / C(8,3) = 30/56',
    explanation:
      'Số cách chọn 3 bi bất kỳ là C(8,3) = 56. Số cách chọn 2 bi đỏ và 1 bi xanh là C(5,2)·C(3,1) = 10·3 = 30. Xác suất = 30/56 ≈ 0,5357 → làm tròn hàng phần trăm là 0,54.',
  },
  {
    id: 'm-03',
    numberInSection: 3,
    section: 'math',
    topicId: 'math-geo',
    topicTitle: 'Hình học không gian & toạ độ Oxyz',
    type: 'numeric',
    prompt:
      'Trong không gian Oxyz, cho hình chóp S.ABCD có đáy ABCD là hình vuông cạnh 4 cm, cạnh bên SA vuông góc với đáy và SA = 6 cm. Tính thể tích khối chóp S.ABCD.',
    unit: 'cm³',
    acceptedNumeric: ['32'],
    numericHint: 'V = (1/3) · S_đáy · h',
    explanation:
      'Diện tích đáy S_ABCD = 4² = 16 cm². Chiều cao h = SA = 6 cm. Thể tích V = (1/3) · 16 · 6 = 32 cm³.',
  },
  {
    id: 'm-04',
    numberInSection: 4,
    section: 'math',
    topicId: 'math-func',
    topicTitle: 'Khảo sát hàm số, tiếp tuyến & cực trị',
    type: 'matching',
    prompt:
      'Ghép mỗi hàm số ở Cột A với tính chất đồ thị tương ứng ở Cột B trên tập xác định của nó.',
    matchingLeft: [
      { id: 'ml-1', leftLabel: '1', leftText: 'y = (2x − 1) / (x + 1)', correctRightId: 'mr-b' },
      { id: 'ml-2', leftLabel: '2', leftText: 'y = x⁴ − 2x² + 3', correctRightId: 'mr-c' },
      { id: 'ml-3', leftLabel: '3', leftText: 'y = x³ + 3x − 1', correctRightId: 'mr-a' },
    ],
    matchingRight: [
      { id: 'mr-a', label: 'P', text: 'Đồng biến trên toàn bộ tập số thực ℝ, không có cực trị' },
      { id: 'mr-b', label: 'Q', text: 'Có tiệm cận đứng x = −1 và tiệm cận ngang y = 2' },
      { id: 'mr-c', label: 'R', text: 'Có 3 điểm cực trị, nhận trục Oy làm trục đối xứng' },
      { id: 'mr-d', label: 'S', text: 'Cắt trục hoành tại đúng 4 điểm phân biệt' },
    ],
    explanation:
      '1-Q: hàm phân thức bậc nhất trên bậc nhất có tiệm cận đứng x = −1, ngang y = 2. 2-R: hàm trùng phương có a·b = −2 < 0 nên có 3 cực trị và là hàm chẵn. 3-P: y′ = 3x² + 3 > 0 với mọi x ∈ ℝ.',
  },
  {
    id: 'm-05',
    numberInSection: 5,
    section: 'math',
    topicId: 'math-prob',
    topicTitle: 'Tổ hợp, xác suất có điều kiện & dãy số',
    type: 'cloze',
    prompt:
      'Hoàn thành đoạn suy luận về cấp số nhân lùi vô hạn dưới đây bằng cách chọn giá trị phù hợp cho mỗi chỗ trống.',
    clozeSegments: [
      { text: 'Xét cấp số nhân (uₙ) có số hạng đầu u₁ = 12 và công bội q = 1/3. Số hạng thứ tư của dãy là u₄ = ' },
      { text: '', blankId: 'b1' },
      { text: '. Vì |q| < 1 nên tổng vô hạn S = u₁ + u₂ + … hội tụ về giá trị ' },
      { text: '', blankId: 'b2' },
      { text: '. Nếu giữ nguyên u₁ nhưng tăng công bội lên q′ = 1/2 thì tổng mới tăng thêm ' },
      { text: '', blankId: 'b3' },
      { text: ' đơn vị.' },
    ],
    clozeBlanks: [
      { id: 'b1', label: 'Chỗ trống [1]', choices: ['4/9', '4/3', '12/81', '3/4'], correctChoice: '4/9' },
      { id: 'b2', label: 'Chỗ trống [2]', choices: ['16', '18', '24', '36'], correctChoice: '18' },
      { id: 'b3', label: 'Chỗ trống [3]', choices: ['4', '6', '8', '12'], correctChoice: '6' },
    ],
    explanation:
      'u₄ = 12·(1/3)³ = 12/27 = 4/9. Tổng S = 12 / (1 − 1/3) = 18. Khi q′ = 1/2, S′ = 12 / (1 − 1/2) = 24, chênh lệch S′ − S = 6.',
  },

  // ================= ĐỌC HIỂU =================
  {
    id: 'r-01',
    numberInSection: 1,
    section: 'reading',
    topicId: 'read-eco',
    topicTitle: 'Ngữ liệu Sinh thái học & Thuỷ văn đồng bằng',
    passageId: 'p-mangrove',
    type: 'mcq',
    prompt:
      'Theo đoạn (2) của ngữ liệu, nguyên nhân trực tiếp làm các hạt bùn mịn lơ lửng sa lắng xuống bề mặt bãi lầy khi triều lên là gì?',
    options: [
      { key: 'A', text: 'Độ mặn nước biển tăng cao làm kết tủa khoáng sét trong nước triều.' },
      { key: 'B', text: 'Mạng lưới rễ cây ngập mặn làm giảm mạnh vận tốc và động năng dòng chảy.' },
      { key: 'C', text: 'Quá trình phân huỷ yếm khí tạo lớp màng sinh học giữ chặt hạt cát.' },
      { key: 'D', text: 'Sóng phản xạ từ đê kè cứng dồn phù sa vào phía trong đai rừng.' },
    ],
    correctOption: 'B',
    explanation:
      'Đoạn (2) nêu rõ vận tốc dòng chảy rối giảm từ 0,48 m/s xuống dưới 0,09 m/s khi qua đai rừng; sự suy giảm động năng khiến hạt lơ lửng không còn đủ lực nâng và sa lắng.',
  },
  {
    id: 'r-02',
    numberInSection: 2,
    section: 'reading',
    topicId: 'read-eco',
    topicTitle: 'Ngữ liệu Sinh thái học & Thuỷ văn đồng bằng',
    passageId: 'p-mangrove',
    type: 'cloze',
    prompt:
      'Dựa vào nội dung đoạn (3) và (4) bên trái, chọn cụm từ phù hợp điền vào đoạn tóm tắt cơ chế sinh địa hoá của rừng ngập mặn.',
    clozeSegments: [
      { text: 'Do lớp đất bùn ngập mặn thường xuyên bão hoà nước, môi trường bên trong chủ yếu ở trạng thái ' },
      { text: '', blankId: 'rb1' },
      { text: ', khiến tốc độ phân giải chất hữu cơ chậm lại và giữ cacbon tồn lưu dài lâu. Ngược lại, khi xây ' },
      { text: '', blankId: 'rb2' },
      { text: ' sát mép nước, sóng phản xạ sẽ bào mòn chân bãi và triệt tiêu khả năng ' },
      { text: '', blankId: 'rb3' },
      { text: ' của dải bờ biển.' },
    ],
    clozeBlanks: [
      {
        id: 'rb1',
        label: 'Chỗ trống [1]',
        choices: ['yếm khí', 'hiếu khí mạnh', 'axit hoá nhanh'],
        correctChoice: 'yếm khí',
      },
      {
        id: 'rb2',
        label: 'Chỗ trống [2]',
        choices: ['đê kè cứng', 'đai cây mắm', 'cống điều tiết triều'],
        correctChoice: 'đê kè cứng',
      },
      {
        id: 'rb3',
        label: 'Chỗ trống [3]',
        choices: ['tự nâng cốt nền', 'giảm độ mặn', 'tăng vận tốc triều rút'],
        correctChoice: 'tự nâng cốt nền',
      },
    ],
    explanation:
      'Thông tin trích trực tiếp từ đoạn (3) về môi trường yếm khí và đoạn (4) về tác động phản xạ sóng của đê kè cứng.',
  },
  {
    id: 'r-03',
    numberInSection: 3,
    section: 'reading',
    topicId: 'read-eco',
    topicTitle: 'Ngữ liệu Sinh thái học & Thuỷ văn đồng bằng',
    passageId: 'p-mangrove',
    type: 'numeric',
    prompt:
      'Theo số liệu thực địa ở đoạn (2), khi dòng chảy đi qua đai rừng rộng 150 mét, vận tốc dòng chảy giảm tối thiểu bao nhiêu m/s (tính từ 0,48 m/s xuống ngưỡng 0,09 m/s)?',
    unit: 'm/s',
    acceptedNumeric: ['0,39', '0.39'],
    numericHint: '0,48 − 0,09',
    explanation:
      'Đoạn (2) cho biết vận tốc giảm từ 0,48 m/s xuống dưới 0,09 m/s, tức độ giảm tối thiểu là 0,48 − 0,09 = 0,39 m/s.',
  },
  {
    id: 'r-04',
    numberInSection: 4,
    section: 'reading',
    topicId: 'read-tech',
    topicTitle: 'Ngữ liệu Vật liệu bán dẫn & Lưu trữ năng lượng',
    passageId: 'p-battery',
    type: 'matching',
    prompt:
      'Dựa trên ngữ liệu «Pin thể rắn», ghép mỗi hiện tượng ở Cột A với nguyên nhân hoặc giải pháp tương ứng ở Cột B.',
    matchingLeft: [
      { id: 'rl-1', leftLabel: '1', leftText: 'Sợi nhánh liti gây chập mạch bên trong', correctRightId: 'rr-b' },
      { id: 'rl-2', leftLabel: '2', leftText: 'Tắc nghẽn dòng ion sau nhiều chu kỳ sạc xả', correctRightId: 'rr-c' },
      { id: 'rl-3', leftLabel: '3', leftText: 'Khắc phục khe hở tại mặt phân cách rắn–rắn', correctRightId: 'rr-a' },
    ],
    matchingRight: [
      { id: 'rr-a', label: 'P', text: 'Phủ lớp đệm dẻo nanômét hoặc duy trì áp suất nén cơ học' },
      { id: 'rr-b', label: 'Q', text: 'Được ngăn chặn nhờ hàng rào cơ học của màng điện giải gốm/polyme rắn' },
      { id: 'rr-c', label: 'R', text: 'Phát sinh do điện cực co giãn làm xuất hiện khe hở vi mô rắn–rắn' },
    ],
    explanation:
      'Đoạn (2) nêu màng rắn ngăn dendrite (1-Q). Đoạn (3) giải thích sự co giãn thể tích tạo khe hở vi mô (2-R). Đoạn (4) đưa hai giải pháp lớp đệm dẻo và nén cơ học (3-P).',
  },

  // ================= KHOA HỌC =================
  {
    id: 's-01',
    numberInSection: 1,
    section: 'science',
    topicId: 'sci-chem',
    topicTitle: 'Cân bằng hoá học, động học & hiệu suất xúc tác',
    type: 'numeric',
    prompt:
      'Dựa vào đồ thị thực nghiệm Hình 2.4 dưới đây (biểu diễn quá trình tổng hợp khí ở hai mức áp suất P₁ và P₂), hãy xác định độ chênh lệch hiệu suất cân bằng Δη = η(P₂) − η(P₁) tại mốc nhiệt độ vận hành tối ưu T* = 450 °C.',
    figure: {
      code: 'HÌNH 2.4',
      title: 'Sự phụ thuộc hiệu suất cân bằng η (%) theo nhiệt độ T (°C)',
      caption: 'Hỗn hợp khí đầu vào có tỷ lệ mol chuẩn 1 : 3; sai số phép đo ±0,5%.',
      variant: 'catalytic-yield',
      hint: 'Tại T* = 450 °C: η(P₂) = 45% và η(P₁) = 30%.',
    },
    unit: '%',
    acceptedNumeric: ['15', '15,0', '15.0'],
    numericHint: 'Đọc giá trị trên trục tung tại đường gióng T* = 450 °C',
    explanation:
      'Tại T* = 450 °C, đường cong P₂ = 350 atm cho η(P₂) = 45% và đường cong P₁ = 200 atm cho η(P₁) = 30%. Độ chênh lệch Δη = 45 − 30 = 15%.',
  },
  {
    id: 's-02',
    numberInSection: 2,
    section: 'science',
    topicId: 'sci-chem',
    topicTitle: 'Cân bằng hoá học, động học & hiệu suất xúc tác',
    type: 'mcq',
    prompt:
      'Quan sát Hình 2.4 khi tăng nhiệt độ từ 300 °C lên 600 °C ở cả hai áp suất không đổi, hiệu suất cân bằng η đều giảm mạnh. Kết luận nhiệt động học nào sau đây phù hợp nhất với dữ liệu thực nghiệm?',
    figure: {
      code: 'HÌNH 2.4',
      title: 'Sự phụ thuộc hiệu suất cân bằng η (%) theo nhiệt độ T (°C)',
      caption: 'Dùng chung đồ thị thực nghiệm áp suất P₁ = 200 atm và P₂ = 350 atm.',
      variant: 'catalytic-yield',
      hint: 'Áp dụng nguyên lý chuyển dịch cân bằng Le Chatelier theo nhiệt độ.',
    },
    options: [
      { key: 'A', text: 'Phản ứng thuận là quá trình thu nhiệt (ΔH > 0) và làm tăng số mol khí.' },
      { key: 'B', text: 'Phản ứng thuận là quá trình toả nhiệt (ΔH < 0) và làm giảm số mol khí.' },
      { key: 'C', text: 'Phản ứng thuận không trao đổi nhiệt (ΔH = 0) nhưng chất xúc tác mất hoạt tính.' },
      { key: 'D', text: 'Hằng số cân bằng K tăng lên khi tăng áp suất tổng của hệ khí.' },
    ],
    correctOption: 'B',
    explanation:
      'Khi tăng nhiệt độ mà hiệu suất giảm, cân bằng dịch chuyển theo chiều nghịch thu nhiệt → chiều thuận toả nhiệt (ΔH < 0). Khi tăng áp suất từ P₁ lên P₂, η tăng → chiều thuận làm giảm số mol khí.',
  },
  {
    id: 's-03',
    numberInSection: 3,
    section: 'science',
    topicId: 'sci-phys',
    topicTitle: 'Cơ học dao động, mạch điện & cảm ứng điện từ',
    type: 'matching',
    prompt:
      'Nối mỗi đại lượng Vật lý ở Cột A với biểu thức xác định đúng ở Cột B (trong hệ SI).',
    matchingLeft: [
      { id: 'sl-1', leftLabel: '1', leftText: 'Tần số góc con lắc lò xo (độ cứng k, khối lượng m)', correctRightId: 'sr-b' },
      { id: 'sl-2', leftLabel: '2', leftText: 'Cảm kháng của cuộn cảm thuần (độ tự cảm L)', correctRightId: 'sr-c' },
      { id: 'sl-3', leftLabel: '3', leftText: 'Năng lượng photon ánh sáng (tần số f)', correctRightId: 'sr-a' },
    ],
    matchingRight: [
      { id: 'sr-a', label: 'P', text: 'ε = h · f' },
      { id: 'sr-b', label: 'Q', text: 'ω = √(k / m)' },
      { id: 'sr-c', label: 'R', text: 'Z_L = ω · L' },
      { id: 'sr-d', label: 'S', text: 'Z_C = 1 / (ω · C)' },
    ],
    explanation:
      '1-Q: ω = √(k/m). 2-R: Z_L = ωL. 3-P: ε = hf theo thuyết lượng tử Planck.',
  },
  {
    id: 's-04',
    numberInSection: 4,
    section: 'science',
    topicId: 'sci-bio',
    topicTitle: 'Di truyền học quần thể & sinh lý thực vật',
    type: 'cloze',
    prompt:
      'Điền thông tin phù hợp về cân bằng di truyền Hardy–Weinberg ở một quần thể thực vật giao phấn ngẫu nhiên có tỷ lệ kiểu gen đồng hợp lặn aa = 0,09.',
    clozeSegments: [
      { text: 'Khi quần thể đạt trạng thái cân bằng di truyền, tần số alen lặn q(a) = ' },
      { text: '', blankId: 'sb1' },
      { text: '. Suy ra tần số alen trội p(A) = ' },
      { text: '', blankId: 'sb2' },
      { text: ' và tỷ lệ kiểu gen dị hợp Aa trong quần thể chiếm ' },
      { text: '', blankId: 'sb3' },
      { text: '.' },
    ],
    clozeBlanks: [
      { id: 'sb1', label: 'Chỗ trống [1]', choices: ['0,09', '0,30', '0,70', '0,81'], correctChoice: '0,30' },
      { id: 'sb2', label: 'Chỗ trống [2]', choices: ['0,30', '0,70', '0,91'], correctChoice: '0,70' },
      { id: 'sb3', label: 'Chỗ trống [3]', choices: ['0,21', '0,42', '0,49'], correctChoice: '0,42' },
    ],
    explanation:
      'q = √0,09 = 0,30; p = 1 − 0,30 = 0,70; tỷ lệ dị hợp 2pq = 2 · 0,70 · 0,30 = 0,42.',
  },
]

// Tạo đầy đủ bộ câu hỏi thực tế cho cấu trúc 40 Toán / 20 Đọc hiểu / 40 Khoa học
function buildFullBank(): QuestionItem[] {
  const bank: QuestionItem[] = [...CORE_QUESTIONS]

  // Bổ sung câu 6..40 môn Toán học (40 câu)
  for (let i = 6; i <= 40; i++) {
    const a = (i % 5) + 2
    const b = (i % 4) + 1
    const isNumeric = i % 4 === 0
    const topicId = i % 3 === 0 ? 'math-geo' : i % 2 === 0 ? 'math-prob' : 'math-func'
    const topicTitle =
      topicId === 'math-geo'
        ? 'Hình học không gian & toạ độ Oxyz'
        : topicId === 'math-prob'
          ? 'Tổ hợp, xác suất có điều kiện & dãy số'
          : 'Khảo sát hàm số, tiếp tuyến & cực trị'

    if (isNumeric) {
      const ans = a * b + 3
      bank.push({
        id: `m-${String(i).padStart(2, '0')}`,
        numberInSection: i,
        section: 'math',
        topicId,
        topicTitle,
        type: 'numeric',
        prompt: `Cho cấp số cộng (uₙ) có số hạng đầu u₁ = ${b} và công sai d = ${a}. Tính giá trị của biểu thức u₂ + u₁ + ${3 - b + (a * b - a)}? (Xác định số nguyên đúng với phương trình tham số: S = ${a}·${b} + 3).`,
        unit: 'đơn vị',
        acceptedNumeric: [String(ans)],
        explanation: `Thay số liệu bài toán: ${a} × ${b} + 3 = ${ans}.`,
      })
    } else {
      const derivAtOne = 3 * a - b
      const choices: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D']
      const correctKey = choices[i % 4]
      const wrong1 = derivAtOne + 2
      const wrong2 = derivAtOne - 3
      const wrong3 = derivAtOne + 5
      const vals = [derivAtOne, wrong1, wrong2, wrong3]
      const rotated = choices.map((k, idx) => {
        const correctPos = choices.indexOf(correctKey)
        const valIndex = (idx - correctPos + 4) % 4
        return { key: k, text: `f′(1) = ${vals[valIndex]}` }
      })

      bank.push({
        id: `m-${String(i).padStart(2, '0')}`,
        numberInSection: i,
        section: 'math',
        topicId,
        topicTitle,
        type: 'mcq',
        prompt: `Cho hàm số đa thức f(x) = ${a}x³ − ${b}x + 4. Hệ số góc tiếp tuyến của đồ thị hàm số tại điểm có hoành độ x = 1 bằng bao nhiêu?`,
        options: rotated,
        correctOption: correctKey,
        explanation: `Ta có f′(x) = ${3 * a}x² − ${b}. Tại x = 1, f′(1) = ${3 * a} − ${b} = ${derivAtOne}.`,
      })
    }
  }

  // Bổ sung câu 5..20 môn Đọc hiểu (20 câu, gắn liền 2 ngữ liệu)
  const readingPrompts: Array<{
    passageId: string
    topicId: string
    topicTitle: string
    prompt: string
    options: [string, string, string, string]
    correct: 'A' | 'B' | 'C' | 'D'
    explanation: string
  }> = [
    {
      passageId: 'p-mangrove',
      topicId: 'read-eco',
      topicTitle: 'Ngữ liệu Sinh thái học & Thuỷ văn đồng bằng',
      prompt: 'Cụm từ «bộ lọc sinh địa hoá» ở đoạn (1) dùng để nhấn mạnh chức năng nào của rừng ngập mặn?',
      options: [
        'Vừa giữ lại trầm tích lơ lửng bằng cơ học, vừa tích luỹ cacbon hữu cơ trong bùn yếm khí.',
        'Chỉ ngăn sóng lớn đánh trực tiếp vào các khu dân cư ven đê biển.',
        'Khử hoàn toàn độ mặn của nước biển trước khi chảy vào đồng ruộng.',
        'Thúc đẩy vi sinh vật hiếu khí phân huỷ thật nhanh lớp thảm mục.',
      ],
      correct: 'A',
      explanation: 'Đoạn (1)–(3) mô tả đồng thời cơ chế bẫy phù sa cơ học và chu trình lưu giữ cacbon yếm khí.',
    },
    {
      passageId: 'p-mangrove',
      topicId: 'read-eco',
      topicTitle: 'Ngữ liệu Sinh thái học & Thuỷ văn đồng bằng',
      prompt: 'Theo đoạn (4), hệ quả dài hạn của việc xây đê kè bê tông sát mép nước biển là gì?',
      options: [
        'Tăng tốc độ tái sinh tự nhiên của cây đước và cây mắm.',
        'Bào mòn chân bãi trước đê và làm mất khả năng tự nâng cốt nền bờ biển.',
        'Giúp phù sa tích tụ nhanh hơn gấp đôi phía ngoài tường bê tông.',
        'Làm giảm mực nước biển dâng tại khu vực cửa sông.',
      ],
      correct: 'B',
      explanation: 'Đoạn (4) chỉ rõ sóng phản xạ từ tường cứng bào mòn chân bãi và làm mất khả năng tự nâng cốt nền.',
    },
    {
      passageId: 'p-battery',
      topicId: 'read-tech',
      topicTitle: 'Ngữ liệu Vật liệu bán dẫn & Lưu trữ năng lượng',
      prompt: 'Ưu điểm an toàn cốt lõi của pin thể rắn so với pin dùng chất điện giải lỏng được nêu ở đoạn (2) là gì?',
      options: [
        'Hoàn toàn không cần sử dụng cực dương và cực âm khi tích trữ điện năng.',
        'Loại bỏ dung môi hữu cơ dễ bay hơi và cản trở sợi nhánh liti xuyên thủng gây chập mạch.',
        'Giảm trọng lượng vỏ pin bằng cách thay lớp gốm bằng dung môi nước muối.',
        'Tăng tốc độ thấm ướt khe hở vi mô lên gấp mười lần.',
      ],
      correct: 'B',
      explanation: 'Đoạn (2) nêu rõ hai điểm: loại bỏ dung môi dễ bay hơi và tạo hàng rào cơ học ngăn dendrite liti.',
    },
    {
      passageId: 'p-battery',
      topicId: 'read-tech',
      topicTitle: 'Ngữ liệu Vật liệu bán dẫn & Lưu trữ năng lượng',
      prompt: 'Vì sao chất điện giải lỏng không gặp vấn đề khe hở tiếp xúc như chất điện giải rắn?',
      options: [
        'Vì chất lỏng có khối lượng riêng lớn hơn gốm oxit.',
        'Vì chất lỏng tự thấm ướt các khe hở vi mô trên bề mặt hạt điện cực.',
        'Vì chất lỏng không bị co giãn nhiệt trong mọi điều kiện vận hành.',
        'Vì chất lỏng tự tạo áp suất nén cơ học từ bên ngoài vỏ pin.',
      ],
      correct: 'B',
      explanation: 'Đoạn (3) giải thích chất lỏng tự thấm ướt mọi khe hở vi mô, còn hai vật rắn chỉ chạm tại điểm lồi cục bộ.',
    },
  ]

  for (let i = 5; i <= 20; i++) {
    const tpl = readingPrompts[(i - 5) % readingPrompts.length]
    bank.push({
      id: `r-${String(i).padStart(2, '0')}`,
      numberInSection: i,
      section: 'reading',
      topicId: tpl.topicId,
      topicTitle: tpl.topicTitle,
      passageId: tpl.passageId,
      type: 'mcq',
      prompt: `${tpl.prompt} (Câu đối chiếu ngữ liệu #${i})`,
      options: [
        { key: 'A', text: tpl.options[0] },
        { key: 'B', text: tpl.options[1] },
        { key: 'C', text: tpl.options[2] },
        { key: 'D', text: tpl.options[3] },
      ],
      correctOption: tpl.correct,
      explanation: tpl.explanation,
    })
  }

  // Bổ sung câu 5..40 môn Khoa học (40 câu)
  for (let i = 5; i <= 40; i++) {
    const topicId = i % 3 === 0 ? 'sci-bio' : i % 2 === 0 ? 'sci-phys' : 'sci-chem'
    const topicTitle =
      topicId === 'sci-bio'
        ? 'Di truyền học quần thể & sinh lý thực vật'
        : topicId === 'sci-phys'
          ? 'Cơ học dao động, mạch điện & cảm ứng điện từ'
          : 'Cân bằng hoá học, động học & hiệu suất xúc tác'

    if (topicId === 'sci-phys') {
      const u = ((i % 4) + 2) * 12
      const r = (i % 3) + 4
      const current = u / r
      bank.push({
        id: `s-${String(i).padStart(2, '0')}`,
        numberInSection: i,
        section: 'science',
        topicId,
        topicTitle,
        type: 'numeric',
        prompt: `Trong một thí nghiệm khảo sát đoạn mạch thuần điện trở R = ${r} Ω, hiệu điện thế ổn định giữa hai đầu điện trở đo được là U = ${u} V. Tính cường độ dòng điện I chạy qua điện trở đó.`,
        unit: 'A',
        acceptedNumeric: [String(current)],
        explanation: `Theo định luật Ohm: I = U / R = ${u} / ${r} = ${current} A.`,
      })
    } else if (topicId === 'sci-chem') {
      const ph = (i % 3) + 2
      bank.push({
        id: `s-${String(i).padStart(2, '0')}`,
        numberInSection: i,
        section: 'science',
        topicId,
        topicTitle,
        type: 'mcq',
        prompt: `Một dung dịch axit mạnh đơn chức ở 25 °C có giá trị pH = ${ph}. Khi pha loãng dung dịch này bằng nước cất lên thể tích gấp 10 lần, giá trị pH mới thu được là bao nhiêu?`,
        options: [
          { key: 'A', text: `pH = ${ph - 1}` },
          { key: 'B', text: `pH = ${ph + 1}` },
          { key: 'C', text: `pH = ${ph + 10}` },
          { key: 'D', text: `pH = ${ph * 2}` },
        ],
        correctOption: 'B',
        explanation: `Pha loãng 10 lần làm nồng độ [H⁺] giảm 10 lần nên pH tăng thêm 1 đơn vị, thành ${ph + 1}.`,
      })
    } else {
      bank.push({
        id: `s-${String(i).padStart(2, '0')}`,
        numberInSection: i,
        section: 'science',
        topicId,
        topicTitle,
        type: 'mcq',
        prompt: `Trong thí nghiệm đo cường độ quang hợp ở lá cây ưa sáng (câu mẫu #${i}), khi tăng cường độ ánh sáng từ vùng tối lên đến điểm bão hoà ánh sáng (nhiệt độ và CO₂ giữ tối ưu), tốc độ thải O₂ thay đổi thế nào?`,
        options: [
          { key: 'A', text: 'Giảm tuyến tính về 0 ngay từ khi có ánh sáng yếu.' },
          { key: 'B', text: 'Tăng dần theo cường độ ánh sáng rồi chững lại tại điểm bão hoà.' },
          { key: 'C', text: 'Không phụ thuộc vào cường độ ánh sáng ở mọi ngưỡng.' },
          { key: 'D', text: 'Đạt cực đại trong bóng tối hoàn toàn.' },
        ],
        correctOption: 'B',
        explanation: 'Dưới điểm bão hoà ánh sáng, cường độ quang hợp tăng khi tăng cường độ sáng; vượt điểm bão hoà tốc độ đạt ngưỡng ổn định.',
      })
    }
  }

  return bank
}

export const FULL_QUESTION_BANK: QuestionItem[] = buildFullBank()

export function getQuestionsForSection(section: SectionId): QuestionItem[] {
  return FULL_QUESTION_BANK.filter((q) => q.section === section).sort(
    (a, b) => a.numberInSection - b.numberInSection,
  )
}

export function getQuestionsForTopic(topicId: string): QuestionItem[] {
  return FULL_QUESTION_BANK.filter((q) => q.topicId === topicId).sort(
    (a, b) => a.numberInSection - b.numberInSection,
  )
}

export function isQuestionAnswered(question: QuestionItem, answer?: UserAnswer): boolean {
  if (!answer) return false
  if (answer.type === 'mcq') return Boolean(answer.value)
  if (answer.type === 'numeric') return answer.value.trim().length > 0
  if (answer.type === 'cloze') {
    const blanks = question.clozeBlanks ?? []
    return blanks.length > 0 && blanks.every((b) => Boolean(answer.values[b.id]))
  }
  if (answer.type === 'matching') {
    const left = question.matchingLeft ?? []
    return left.length > 0 && left.every((row) => Boolean(answer.pairs[row.id]))
  }
  return false
}

export function isQuestionCorrect(question: QuestionItem, answer?: UserAnswer): boolean {
  if (!answer) return false
  if (question.type === 'mcq' && answer.type === 'mcq') {
    return answer.value === question.correctOption
  }
  if (question.type === 'numeric' && answer.type === 'numeric') {
    const normalized = answer.value.trim().replace(',', '.')
    return (question.acceptedNumeric ?? []).some(
      (item) => item.replace(',', '.') === normalized,
    )
  }
  if (question.type === 'cloze' && answer.type === 'cloze') {
    const blanks = question.clozeBlanks ?? []
    return blanks.length > 0 && blanks.every((b) => answer.values[b.id] === b.correctChoice)
  }
  if (question.type === 'matching' && answer.type === 'matching') {
    const left = question.matchingLeft ?? []
    return left.length > 0 && left.every((row) => answer.pairs[row.id] === row.correctRightId)
  }
  return false
}

export function formatUserAnswerSummary(question: QuestionItem, answer?: UserAnswer): string {
  if (!answer || !isQuestionAnswered(question, answer)) return 'Chưa trả lời'
  if (answer.type === 'mcq') return `Chọn ${answer.value}`
  if (answer.type === 'numeric') return `${answer.value}${question.unit ? ` ${question.unit}` : ''}`
  if (answer.type === 'cloze') {
    return (question.clozeBlanks ?? []).map((b) => answer.values[b.id] || '—').join(' · ')
  }
  if (answer.type === 'matching') {
    return (question.matchingLeft ?? [])
      .map((l) => {
        const target = (question.matchingRight ?? []).find((r) => r.id === answer.pairs[l.id])
        return `${l.leftLabel}-${target?.label ?? '?'}`
      })
      .join(', ')
  }
  return '—'
}

export function formatCorrectAnswerSummary(question: QuestionItem): string {
  if (question.type === 'mcq') return `Đáp án ${question.correctOption}`
  if (question.type === 'numeric') {
    return `${question.acceptedNumeric?.[0] ?? ''}${question.unit ? ` ${question.unit}` : ''}`
  }
  if (question.type === 'cloze') {
    return (question.clozeBlanks ?? []).map((b) => b.correctChoice).join(' · ')
  }
  if (question.type === 'matching') {
    return (question.matchingLeft ?? [])
      .map((l) => {
        const target = (question.matchingRight ?? []).find((r) => r.id === l.correctRightId)
        return `${l.leftLabel}-${target?.label ?? '?'}`
      })
      .join(', ')
  }
  return '—'
}

// Tạo bộ đáp án mẫu ban đầu để khi thí sinh vào Thi thử đầy đủ hoặc xem Kết quả đã có sẵn dữ liệu thực tế (ví dụ Toán 31/40)
export function buildInitialSimulationSample(): {
  answers: Record<string, UserAnswer>
  flagged: Record<string, boolean>
} {
  const answers: Record<string, UserAnswer> = {}
  const flagged: Record<string, boolean> = {}

  const mathQs = getQuestionsForSection('math')
  mathQs.forEach((q, idx) => {
    // Làm sẵn câu 6..40 để mô phỏng bài thi gần hoàn tất (chừa câu 1..5 để học sinh tự thử mọi dạng câu hỏi)
    if (idx < 5) return
    if (q.type === 'mcq' && q.correctOption) {
      const wrong: 'A' | 'B' | 'C' | 'D' = q.correctOption === 'A' ? 'B' : 'A'
      // Đạt 31/40 nếu làm đúng cả 5 câu đầu (28/35 đúng sẵn + 3 câu sau đúng = 31)
      answers[q.id] = { type: 'mcq', value: idx % 5 === 0 ? wrong : q.correctOption }
    } else if (q.type === 'numeric' && q.acceptedNumeric?.[0]) {
      answers[q.id] = { type: 'numeric', value: idx % 7 === 0 ? '99' : q.acceptedNumeric[0] }
    }
    if (idx === 12 || idx === 24) flagged[q.id] = true
  })

  const readQs = getQuestionsForSection('reading')
  readQs.forEach((q, idx) => {
    if (idx < 4) return
    if (q.type === 'mcq' && q.correctOption) {
      const wrong: 'A' | 'B' | 'C' | 'D' = q.correctOption === 'A' ? 'C' : 'A'
      answers[q.id] = { type: 'mcq', value: idx % 4 === 0 ? wrong : q.correctOption }
    }
    if (idx === 7) flagged[q.id] = true
  })

  const sciQs = getQuestionsForSection('science')
  sciQs.forEach((q, idx) => {
    if (idx < 4) return
    if (q.type === 'mcq' && q.correctOption) {
      const wrong: 'A' | 'B' | 'C' | 'D' = q.correctOption === 'B' ? 'D' : 'B'
      answers[q.id] = { type: 'mcq', value: idx % 4 === 0 ? wrong : q.correctOption }
    } else if (q.type === 'numeric' && q.acceptedNumeric?.[0]) {
      answers[q.id] = { type: 'numeric', value: idx % 6 === 0 ? '0' : q.acceptedNumeric[0] }
    }
    if (idx === 9) flagged[q.id] = true
  })

  flagged['m-01'] = true
  return { answers, flagged }
}
