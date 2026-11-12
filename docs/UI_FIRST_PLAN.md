> Tài liệu lịch sử của đợt UI. Giao diện đã hoàn thành và đang nối backend; nhiệm vụ mới/nhánh làm việc xem [REMOTE_COLLABORATION.md](REMOTE_COLLABORATION.md).

# Plan hoàn thiện giao diện trước, nối backend sau

> Bản bàn giao chi tiết, có nguồn file/dòng và tham khảo Jira: [UI_IMPLEMENTATION_HANDOFF.md](UI_IMPLEMENTATION_HANDOFF.md). Gửi [AGENT_START_UI.md](AGENT_START_UI.md) cho agent mới để bắt đầu. Đây là tài liệu kế hoạch; chưa phải xác nhận đã triển khai các màn mới.

Ngày 12/11/2026. Yêu cầu mới nhất: ưu tiên giao diện, phần tích hợp backend thực hiện ở giai đoạn tiếp theo. Đây là plan chờ người dùng chốt trước khi sửa code.

## Phạm vi và nền hiện có

- Dùng tiếp FE work/jira_fe, Next.js/React/TypeScript/Tailwind/Radix/TanStack Query đang có. Không tạo lại dự án hoặc nâng framework trong đợt UI.
- Phong cách theo bản Jira đã có: header 56px, sidebar 240px, nền trắng/xám, xanh #0052cc, góc bo nhỏ, bảng/danh sách gọn, tiếng Việt.
- BacklogView/PlanningShell/planning-parts và fixture hiện tại là nền để thống nhất các màn hình.
- Có thay đổi chưa commit ở backlog-preview, backlog-view, planning-shell, model và các file review mới. Giữ và tích hợp trên phần đó, không reset/ghi đè bằng bản cũ.
- Các màn duyệt dùng /ui-review trong development, dữ liệu mẫu có nhãn rõ. Trang thật/logic API hiện có giữ nguyên đến đợt nối BE. Khi chuẩn bị bản demo production sẽ có plan riêng cho bật chế độ demo; không âm thầm bỏ guard đăng nhập.
- Không gọi API/ghi DB, không gửi email/upload Cloudinary. Tạo/sửa/xóa trong demo cập nhật state chung để có thể bấm thử cả luồng. Refresh trình duyệt reset về fixture.

## Luồng xử lý và các phần dự kiến thêm/sửa

### 1. State chung và layout

Đầu vào là fixture dự án, issue, sprint, member, comment, attachment mẫu, notification, workflow, role và báo cáo. ID là ID mẫu nội bộ; projectId/sprintId/issueId/userId/columnId phân biệt rõ, không suy diễn ID thật.

Mở rộng ReviewProvider hoặc tách phần dữ liệu thành DemoProvider ở src/features/ui-demo, có useDemo/useReview adapter để giữ BacklogPreview đang có. Provider quản lý selectedProjectId và người dùng mẫu; layout trang xác thực không dùng sidebar, các trang dự án dùng shell chung. PlanningShell hoặc AppShell nhận active section, project và notification count để nav highlight và tiêu đề nhất quán.

Các hàm tạo/sửa/xóa tìm đúng ID và project trước cập nhật bản sao state; ID không tồn tại báo lỗi trong UI, không tự tạo dữ liệu thay thế. Không dùng $id/workspaceId giả để xác định dự án trong phần UI mới. Không có đọc/ghi bảng DB.

### 2. Xác thực và tài khoản

Các trang sign-in/sign-up/profile/change-password trong bộ demo dùng form và trạng thái mẫu. Form kiểm email/tên/mật khẩu/xác nhận trước khi chuyển trạng thái; sai hiển thị dưới trường và giữ nội dung đã nhập.

submitDemoSignIn/submitDemoSignUp chỉ tạo phiên demo và điều hướng tới danh sách dự án; logoutDemo xóa phiên demo. editDemoProfile cập nhật tên/avatar hiển thị ở header và các panel; changeDemoPassword chỉ mô phỏng kết quả form, không lưu mật khẩu rõ trong storage/log.

Có lựa chọn vai trò demo admin/PM/developer để duyệt trạng thái hiển thị theo quyền; đây là mô phỏng UX, không được trình bày là xác thực/phân quyền backend.

### 3. Danh sách và tổng quan dự án

Trang projects có tìm kiếm, bảng/card thống nhất, modal tạo, menu sửa/xóa và trạng thái không có dự án. Form lấy tên/key/mô tả; key mẫu trùng/blank không lưu.

createDemoProject sinh ID mới và giữ project key ổn định; updateDemoProject chỉ sửa dự án đang chọn; deleteDemoProject có hộp xác nhận và điều hướng về danh sách sau khi bỏ khỏi state demo. Khi tạo mới có hướng dẫn thiết lập member, issue type và board, không hiển thị dashboard đầy số liệu giả cho dự án rỗng.

Tổng quan đọc state của project hiện tại: số issue, sprint đang chạy, thành viên và hoạt động gần đây. Không dùng analytics mock rời rạc của giao diện cũ.

### 4. Backlog và sprint

Dùng BacklogView hiện có, nối actions vào state demo chung. Tạo sprint/issue kiểm tên/type/ngày trước update; chỉ một sprint ACTIVE trong dữ liệu demo của project.

Mở rộng demo state giữ CLOSED thay vì xóa mất sprint khi complete. completeDemoSprint giữ DONE theo category mẫu, chuyển việc chưa xong theo lựa chọn và cập nhật backlog/board/report cùng state. Không dựng hai bản sao issue khác nhau ở backlog và board.

Reorder nhóm nhận toàn bộ ID của nhóm đang hiển thị; khi đang lọc thì khóa reorder hoặc giải thích rõ phạm vi, không làm mất các việc bị ẩn. Sửa/xóa FUTURE có modal/xác nhận; ACTIVE/CLOSED hiển thị hành động đúng trạng thái.

### 5. Board và kéo thả

BoardPage đọc selectedProjectId, sprint đang chọn, columns và issue từ cùng provider. Bổ sung board selector/sprint selector, bộ lọc người nhận/type, badge WIP, empty state khi chưa có sprint hoặc chưa mapping.

moveDemoCard nhận issueId/columnId/statusId/position của dữ liệu mẫu. Kiểm issue đúng project, cột đúng board, workflow/WIP/vị trí trước thay state; không map cứng 1=TODO hoặc gán tên trạng thái làm ID.

Cập nhật card và thứ tự rồi phản ánh ở danh sách/chi tiết/backlog. Không dùng useBulkUpdateTasks đang gọi API thật. Nếu cột có nhiều status, hiển thị lựa chọn đích. Có thao tác bàn phím hoặc menu “Chuyển tới” thay thế drag.

### 6. Danh sách issue và chi tiết dùng chung

IssuesPage lấy issue của project, tìm/lọc/sort/page cục bộ trên fixture. Trạng thái filter phản ánh trên URL hoặc state điều hướng, đổi filter về trang đầu, page vượt dữ liệu được điều chỉnh sau khi xóa.

IssueDetailsPanel dùng chung từ Board/Backlog/List, có title/key/type/status/priority/assignee/reporter/story points/mô tả/issue cha. Form có dirty state, lưu/hủy và lỗi validation; cancel không thay state. Nút xóa có confirm, lỗi còn con/attachment có trạng thái minh họa rõ.

CommentSection có thêm/sửa/xóa theo tác giả/vai trò demo; AttachmentSection có chọn tệp, tên/dung lượng, preview/tải mẫu và xóa khỏi state. Object URL nếu tạo phải revoke khi bỏ tệp/unmount; không giả vờ đã upload lên server. Không chèn HTML comment do người dùng nhập.

### 7. Thành viên và cài đặt dự án

MembersPage đọc member thuộc selectedProjectId, có tìm kiếm, thêm, đổi role, gỡ thành viên và trạng thái lead. Role project khác role hệ thống trong fixture; chỉ một PM và không cho gỡ lead khi vẫn là lead. Lỗi validation dừng trước update.

ProjectSettings có tab thông tin, issue type/default, board/cột/status mapping/WIP và workflow. editDemoColumns/mapDemoStatus/reorderDemoColumns kiểm đúng board/ID trước ghi state; xóa cột còn card hiện lỗi hoặc yêu cầu chuyển trước, không làm mất issue.

Issue types/status/workflow hiển thị dùng dữ liệu chung với form issue, không mỗi màn một danh sách riêng. Cấu hình toàn hệ thống đặt trong khu quản trị; project settings chỉ cấu hình của dự án.

### 8. Notification và báo cáo Scrum

Header có bell/unread count và panel notification; InboxPage có tab tất cả/chưa đọc, đánh dấu một/tất cả, xóa và mở issue liên quan bằng panel chung. Hàm markDemoRead/deleteDemoNotification chỉ cập nhật inbox người dùng mẫu đang chọn.

ReportsPage có chọn sprint, summary, velocity và burndown. Dùng SVG/component biểu đồ phù hợp trong FE; fixture có rõ ngày/đơn vị và trạng thái chưa có lịch sử. Dữ liệu báo cáo demo đi cùng trạng thái sprint/issue hoặc snapshot mẫu có nhãn, không biểu diễn số trang trí như dữ liệu thật.

### 9. Quản trị

Admin shell hoặc section riêng có tổng quan, user (tìm/sửa trạng thái/gán role), role-permission, issue type/status/workflow chung và audit có filter/page/detail.

setDemoUserEnabled/grantDemoRole/revokeDemoRole dùng userId/roleId mẫu; bảo vệ trạng thái admin cuối trong dữ liệu demo để UX phản ánh nghiệp vụ. Audit thêm bản ghi mô phỏng sau thao tác, actor hệ thống có thể null. Vai trò không được phép có màn 403 và menu phù hợp; không coi ẩn nút là enforcement BE.

### 10. Trạng thái và kiểm tra giao diện

Mọi trang có loading/empty/error/403/404/success, modal xác nhận, form errors và pending state nhất quán; trạng thái tải/lỗi có thể bật trong demo để duyệt. Không để nút/link trỏ 404 hoặc nút lưu không có phản hồi.

Kiểm desktop/tablet/mobile, overflow bảng/board, focus dialog, tab/keyboard, icon có nhãn, contrast và văn bản tiếng Việt. Chạy typecheck, model test cần thiết và production build. Duyệt browser/screenshot từng nhóm màn khi công cụ khả dụng; nếu không thì ghi rõ chưa kiểm visual, không dùng ảnh cũ để báo bản mới.

## Thứ tự bàn giao

1. Shell/state chung + danh sách/tổng quan dự án.
2. Backlog/sprint + board + issue list/chi tiết/comment/attachment.
3. Thành viên + cài đặt project/board/cột/workflow.
4. Notification + báo cáo.
5. Tài khoản + các trang quản trị.
6. Rà responsive/trạng thái/điều hướng, build và bộ ảnh duyệt.

Mỗi đợt tự kiểm tra rồi commit riêng, không dùng sub-agent và không push khi chưa được yêu cầu. Chỉ commit các thay đổi thuộc đợt đã kiểm, giữ phần sửa dở từ trước.

## Điều kiện chốt UI trước khi nối BE

- Có màn hình và điều hướng cho đủ 19 nhóm chức năng đã chốt.
- Bấm thử được các thao tác chính bằng state mẫu, dữ liệu đồng nhất giữa các trang.
- Phong cách đồng nhất với backlog đã được chọn; responsive và trạng thái lỗi/rỗng/tải rõ.
- Chỉ dữ liệu demo trong bộ trang duyệt, không có request mutation tới Spring Boot.
- Ghi riêng các điểm cần adapter/API sau này; không làm chúng thành điều kiện để hoàn thành bản UI.

## Baseline đã kiểm ở lượt lập plan

- TypeScript tsc --noEmit --incremental false: đạt.
- npm run test:planning: 6 test đạt; chỉ kiểm model hiện có, không chứng minh các trang mới.
- npm run build: đạt trên trạng thái code hiện tại.
- npm run lint độc lập: chưa chạy được vì Next mở trình cấu hình ESLint, exit 1. Việc build thành công không có nghĩa lint độc lập đã qua.
- Chưa kiểm browser/screenshot mới trong lượt này. Các ảnh ở outputs/fe-review thuộc các bản trước.
