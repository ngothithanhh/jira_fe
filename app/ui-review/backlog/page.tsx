import { redirect } from 'next/navigation';

/** Giữ link cũ /ui-review/backlog: chuyển tới backlog của dự án mẫu SCR (ID 1). */
export default function LegacyBacklogReview() {
  redirect('/ui-review/projects/1/backlog');
}
