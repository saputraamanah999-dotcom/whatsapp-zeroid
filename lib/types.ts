export type Visibility = 'everyone' | 'contacts' | 'nobody';

export type Privacy = {
  lastSeen: Visibility;
  profilePhoto: Visibility;
  about: Visibility;
  groups: Visibility;
  readReceipts: boolean;
  storyReplies: boolean;
};

export type NotifPrefs = {
  messages: boolean;
  groups: boolean;
  stories: boolean;
  calls: boolean;
  preview: boolean;
  sound: boolean;
};

/** Trusted roles — only provisioned by an existing admin / Firebase console, never by the client. */
export type Role = 'user' | 'moderator' | 'admin' | 'developer';

export type User = {
  id: string;
  name: string;
  email: string;
  about: string;
  avatar: string | null;
  banner?: string | null;
  color: string;
  phone?: string;
  role: Role;
  username?: string;
  developer?: boolean;
  blueCheck?: boolean;
  vipUntil?: number;
  memberUntil?: number;
  security?: boolean;
  otpVerified?: boolean;
  /** hashed OTP (Trigger Email flow) — internal, never returned to other users */
  otpCode?: string;
  otpExpires?: number;
  pin?: string;
  spotify?: SpotifyTrack | null;
  verified: boolean;
  banned: boolean;
  suspendedUntil?: number;
  banReason?: string;
  lastSeen: number;
  createdAt: number;
  privacy: Privacy;
  notif: NotifPrefs;
  blocked: string[];
  contacts: string[];
};

export type ChatType = 'direct' | 'group' | 'channel' | 'global' | 'bot' | 'ai';

export type Chat = {
  id: string;
  type: ChatType;
  name?: string;
  description?: string;
  avatar?: string | null;
  color?: string;
  members: string[];
  admins: string[];
  createdBy: string;
  createdAt: number;
  lastRead: Record<string, number>;
  typing: Record<string, number>;
  pinnedBy: string[];
  mutedBy: string[];
  archivedBy: string[];
  verified?: boolean;
  /** only admins can post (channels) */
  postPolicy?: 'everyone' | 'admins';
  /** denormalised last message for chat-list previews (written on send) */
  lastMsg?: { text: string; type: MsgType; senderId: string; createdAt: number };
  /** public join link token (groups/channels) */
  inviteCode?: string;
  /** disappearing messages timer — set by group admins */
  disappearing?: 'off' | '24h' | '7d' | '90d';
};

export type MsgType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'system' | 'call' | 'sticker' | 'order' | 'location' | 'contact';

export type SpotifyTrack = { id: string; kind: 'track' | 'playlist' | 'album'; title: string; thumb?: string };
export type YouTubeTrack = { id: string; kind: 'youtube'; title: string; thumb?: string };

export type Sticker = { id: string; uri: string; ownerId: string; global: boolean; createdAt: number };

export type ProductKey = 'vip' | 'member' | 'bluecheck' | 'security';

export type Order = {
  id: string;
  userId: string;
  product: ProductKey;
  plan: string;
  price: number;
  days: number;
  status: 'pending' | 'paid' | 'rejected';
  method: string;
  chatId: string;
  createdAt: number;
  decidedAt?: number;
};

export type MediaMeta = {
  mime?: string;
  width?: number;
  height?: number;
  thumb?: string;
  path?: string; // storage path (for deleting/authorising)
};

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  type: MsgType;
  text?: string;
  uri?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  mime?: string;
  width?: number;
  height?: number;
  thumb?: string;
  storagePath?: string;
  replyTo?: string;
  createdAt: number;
  deliveredAt?: number;
  editedAt?: number;
  deletedForAll?: boolean;
  deletedFor: string[];
  reactions: Record<string, string>;
  starredBy: string[];
  forwarded?: boolean;
  orderId?: string;
  /** location message */
  lat?: number;
  lng?: number;
  locationLabel?: string;
  /** contact card message */
  contactName?: string;
  contactPhone?: string;
  /** disappearing messages: epoch ms when this message auto-removes */
  expiresAt?: number;
  /** epoch ms when the EXTERNAL media host deletes the file (temporary hosts) */
  mediaExpiresAt?: number;
  /** DeepSeek chain-of-thought (assistant messages only) */
  reasoning?: string;
  /** true when written by the AI assistant through the current user's session */
  assistant?: boolean;
  /** optimistic UI only — never persisted */
  status?: MessageStatus;
};

export type Story = {
  id: string;
  userId: string;
  type: 'text' | 'image' | 'video';
  text?: string;
  bg?: string;
  uri?: string;
  createdAt: number;
  expiresAt: number;
  viewers: string[];
  likes: string[];
};

export type CallStatus = 'ringing' | 'ongoing' | 'ended' | 'missed' | 'declined' | 'busy';

export type Call = {
  id: string;
  chatId: string;
  callerId: string;
  calleeIds: string[];
  video: boolean;
  status: CallStatus;
  startedAt: number;
  connectedAt?: number;
  endedAt?: number;
};

export type NotifKind = 'message' | 'story' | 'call' | 'group' | 'system' | 'admin';

export type AppNotification = {
  id: string;
  userId: string;
  kind: NotifKind;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  chatId?: string;
  storyUserId?: string;
};

export type Report = {
  id: string;
  messageId: string;
  chatId: string;
  reporterId: string;
  reason: string;
  createdAt: number;
  resolved?: boolean;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  level: 'info' | 'warning' | 'critical';
  createdAt: number;
  activeUntil: number;
  popup: boolean;
  createdBy: string;
};

export type AuditLog = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  target?: string;
  detail?: string;
  createdAt: number;
};

export type PlatformConfig = {
  maintenance?: { enabled: boolean; message?: string; until?: number };
  flags?: Record<string, boolean>;
};

export type Invite = {
  id: string;
  chatId: string;
  code: string;
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
  revoked?: boolean;
};

export type AnimeFav = {
  id: string;
  uid: string;
  slug: string;
  title: string;
  poster?: string;
  createdAt: number;
};

export type DB = {
  version: number;
  users: Record<string, User>;
  chats: Record<string, Chat>;
  messages: Record<string, Message[]>;
  stories: Story[];
  calls: Call[];
  notifications: AppNotification[];
  reports: Report[];
  stickers: Sticker[];
  orders: Order[];
  announcements: Announcement[];
  audit: AuditLog[];
  animeFavs: AnimeFav[];
  config: PlatformConfig | null;
};
