/** A free, no-account Jitsi Meet room unique to a course (or conversation). */
export function jitsiRoomUrl(kind: "course" | "dm", id: string) {
  return `https://meet.jit.si/ICLCA-${kind}-${id}`;
}

export function meetingProvider(url: string) {
  if (/zoom\.us/i.test(url)) return "Zoom";
  if (/meet\.google\.com/i.test(url)) return "Google Meet";
  if (/teams\.(microsoft|live)\.com/i.test(url)) return "Microsoft Teams";
  if (/meet\.jit\.si/i.test(url)) return "Jitsi Meet";
  return "video call";
}
