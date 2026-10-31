export const GroupDetailsModal = (_props: {
  onUpdateGroup: (updates: Record<string, unknown>) => void;
  onAddMembers: (ids: string[]) => void;
  onRemoveMember: (id: string) => void;
  onPromoteAdmin: (id: string) => void;
  onDismissAdmin: (id: string) => void;
  onMuteGroup: () => void;
  onReportGroup: () => void;
  onExitGroup: () => void;
  [key: string]: any;
}) => null;
