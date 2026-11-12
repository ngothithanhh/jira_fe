# Bình luận và attachment local

Nối vào IssuePanel dùng chung của danh sách công việc, backlog và Scrum board. Mở công việc rồi cuộn xuống hai tab Bình luận/Tệp đính kèm. Dữ liệu dùng API Spring Boot và PostgreSQL, không dùng DemoProvider. Theo chỉ định của người dùng, nội dung file lưu bytea trong DB local và không cần Cloudinary.

## Luồng API

Browser → BFF /api/backend cùng origin → Spring Boot /api → PostgreSQL. Cookie HttpOnly chứa phiên; author/uploader lấy từ JWT. projectId là projects.project_id của route đã qua gate, issueId/commentId/attachmentId là khóa DB tương ứng, không phải số đuôi mã COLLAB-1.

| Thao tác | Method/path sau /api/backend |
|---|---|
| Đọc/thêm bình luận | GET/POST issues/{issueId}/comments |
| Sửa bình luận | PUT issues/{issueId}/comments/{commentId}, body commentText/expectedVersion |
| Xóa bình luận | DELETE cùng path, query expectedVersion |
| Đọc/upload tệp | GET/POST issues/{issueId}/attachments; upload đúng một multipart file |
| Tải nội dung | GET issues/{issueId}/attachments/{attachmentId}/content |
| Xóa tệp | DELETE issues/{issueId}/attachments/{attachmentId} |

VIEW_PROJECT cho phép đọc/thêm bình luận. Tác giả còn quyền xem hoặc người có EDIT_ISSUE được sửa/xóa comment. File cần EDIT_ISSUE để upload; chủ upload vẫn cần VIEW_PROJECT khi xóa, người khác cần EDIT_ISSUE. BE kiểm parent và quyền độc lập với nút UI. Comment text 1..10000 ký tự; version cũ409, sai parent404. Bản nháp giữ version lúc mở sửa/xác nhận xóa, không tự thay bằng version mới sau refetch.

File không rỗng, tối đa10MiB. Browser để FormData tự sinh boundary; BFF kiểm byte thực và part thừa/trùng, BE kiểm lại. Metadata ở issue_attachments, bytea ở issue_attachment_contents; list không tải nội dung. Upload/delete hai bảng trong cùng transaction, lỗi rollback cả hai. API content kiểm VIEW_PROJECT và đúng parent trước tải bytea; trả attachment/nosniff/no-store. Preview chỉ raster theo magic bytes BE và MIME response; HTML/SVG không thực thi. Object URL chỉ tạo từ Blob đã đọc qua API, được thu hồi sau dùng hoặc khi đổi scope. Không có URL lưu trữ bên ngoài trong luồng này.

Tệp legacy chỉ có URL hiển thị thiếu nội dung local, không tự fetch Cloudinary. Xóa legacy chỉ gỡ dữ liệu local. Backend giữ API DELETE cũ tương thích, nhưng BFF mới chỉ mở route có parent. Chi tiết BE và migration xem docs/ATTACHMENTS_LOCAL_API.md trong repo backend. 007 đã áp dụng trước khi yêu cầu đổi sang local nên giữ checksum; 008 thêm bảng bytea và storage_type.

## Phiên, lỗi và chế độ đọc

- Read dùng actor/project/issue trong query key, probe actor dưới khóa phiên và AbortSignal. Nếu cần refresh401 thì thực hiện ngoài khóa, rồi probe lại actor trước GET.
- Write dùng connectedMutation, capture scope và kiểm gate/issue/quyền mới nhất trước dispatch. Khóa bấm đôi giữ tới refetch/completion; không tự replay mutation. Response muộn không cập nhật form của tài khoản khác.
- Sau commit, đánh stale cache theo actor kể cả panel đã unmount. Lỗi completion/refetch báo đã lưu nhưng chưa xác nhận, giữ draft và khóa gửi lại đến khi reload. Timeout/5xx có thể đã commit nên không tự mở lại nút gửi.
- GET lỗi hiển thị retry, giữ draft/file đã chọn và không biến lỗi thành danh sách rỗng. Project gate503 có nút Tải lại dữ liệu ngay trong panel để phục hồi quyền mà không đóng bản nháp.
- Board CLOSED khóa ghi, vẫn cho người có VIEW_PROJECT xem/tải file. Download có probe completion; probe lỗi hiện thông báo và không phát Blob URL, có thể thử đọc lại sau phục hồi.

## Kiểm chứng tại máy chính — 12/11/2026

- 117 FE unit đạt:93 connected +6 planning +18 UI. TypeScript và production build đạt.
- 395 BE unit/MockMvc và62 PostgreSQL integration đạt, không fail/error/skip. Local API smoke xác nhận upload201, download đúng byte, delete204 và multipart trực tiếp: empty400/oversize413/extra-field400.
- 4 ca PostgreSQL mới kiểm migration007/008 lặp và metadata/bytea đúng byte; upload rollback không để hàng rời; delete rollback phục hồi cả hai bảng; delete đồng thời một lượt thành công và cuối cùng không còn dữ liệu. Nhóm DataJpa này mock ProjectSecurity; browser bên dưới dùng auth/quyền DB thật.
- 11 nhóm browser production đạt: comment CRUD/cancel/F5/double submit/XSS; edit/delete version cũ409; download completion503/error/retry; PNG/text upload/F5/exact download/delete/parent404; empty/oversize/MIME spoof; viewer/outsider/owner bị gỡ; GET503 giữ draft và commit rồi probe503 khóa gửi lại; queued cookie switch; late commit/mobile; gate503 giữ comment/file/retry trong panel; CLOSED board vẫn preview/download.
- Hồi quy đạt60 nhóm (13 auth +11 project +15 issue/backlog +13 board +8 notification/report), suite thành viên và6 nhóm account. Ca account upstream-proxy loss tùy chọn không chạy lại đợt này; ca browser-loss sau commit vẫn chạy. Notification fixture được sửa yêu cầu tối thiểu4 chưa đọc để sau read/read/delete còn mục cho read-all; không đổi logic notification sản phẩm.
- Những ca lỗi503/mất response/timing được chèn bằng Playwright; các luồng dữ liệu thông thường, quyền, version và upload/download dùng HTTP/DB local thật. Không kiểm dịch vụ lưu file ngoài vì luồng này không sử dụng dịch vụ đó.
- Review độc lập chỉ đọc theo10 tiêu chí AGENTS. Đã sửa retry gate trong panel, readOnly chặn đọc file và download completionfalse im lặng; cả ba có browser kiểm lại. Kết quả chạy do main thực hiện, không phải reviewer tự chạy. Không bảo đảm tải lớn hoặc mọi interleaving.

## Chạy lại

Trong FE dùng Node24:

```powershell
npm run test:connected
npm run test:planning
npm run test:ui-demo
npx tsc --noEmit
$env:NEXT_DIST_DIR='.next-connected-build'
npm run build
```

Browser: npm run test:collaboration:browser. Cần FE/BE/DB test đang chạy; COLLAB_CREDENTIALS trỏ JSON local gồm origin, api, projectId, issueId, issueKey, otherIssueId, seedCommentId, viewRoleId, developerRoleId và admin/pm/viewer/uploader/outsider (id/email/password). Uploader ban đầu có role developer, viewer có membership nhưng không EDIT_ISSUE. seedCommentId do viewer tạo; project test có key COLLAB, issue đã gán loại hợp lệ. Script kiểm guard project trước dọn; chỉ xóa dữ liệu prefix E2ECOLLAB, không dùng project hoặc tệp thật. Script có gỡ uploader khỏi project và tạo sprint CLOSED, do đó dùng tài khoản/fixture riêng.

COLLAB_OUTPUT chọn thư mục bằng chứng; PLAYWRIGHT_MODULE/CHROMIUM_PATH chọn runtime có sẵn. Fixture JSON và log/ảnh ở outputs/backend-integration/collaboration ngoài Git; không commit credential hoặc build/JAR. BE: ./mvnw.cmd test và scripts/test-postgres.ps1 trên PostgreSQL test riêng bằng JDK17.

## Luồng kiểm bằng tay

1. Đăng nhập PM như các phần trước (pm.demo@example.test). Mở http://127.0.0.1:3130/app/projects/27/issues → COLLAB-1. Credential PM và viewer riêng ở outputs/backend-integration/collaboration/manual-credentials.local.json ngoài Git.
2. Cuộn xuống Bình luận → nhập nội dung → Gửi bình luận → sửa/Hủy sửa hoặc Lưu bình luận → F5 mở lại → xóa qua xác nhận. Dùng hai tab mở Sửa cùng comment, tab đầu lưu trước, tab sau lưu phải409 và giữ draft.
3. Chọn Tệp đính kèm. Có checklist-nghiem-thu.txt và anh-minh-hoa-demo.png đã lưu thật. Bấm Xem ảnh/Tải xuống; F5 vẫn còn. Chọn file riêng dưới10MiB → Tải tệp lên → kiểm tên/dung lượng → tải lại nội dung → Xóa tệp qua xác nhận.
4. Đăng nhập viewer trong file local: được xem/tải và bình luận, chỉ sửa/xóa comment của mình; không upload hoặc xóa file người khác. Mở project bằng outsider để kiểm bị chặn.
5. Kiểm bằng mobile và đổi tài khoản ở tab khác khi đang nhập: draft/dữ liệu phiên cũ phải được bỏ. Nếu API lỗi, dùng retry trong panel; nếu thao tác đã lưu nhưng chưa xác nhận, reload để đối chiếu trước khi gửi lại.

ID27/COLLAB-1 là dữ liệu local lúc bàn giao, không áp dụng mặc định trên máy khác. Preview gọi BE8080 và jira_demo_ready với schema validate. Dữ liệu SHOP giữ nguyên; bộ dữ liệu demo riêng được chuẩn bị lại sau kiểm tra.
