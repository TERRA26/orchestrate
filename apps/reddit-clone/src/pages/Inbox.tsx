import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Send,
  Mail,
  MailOpen,
  Inbox as InboxIcon,
  PenSquare,
  ChevronDown,
  ChevronUp,
  Reply,
} from "lucide-react";
import type { Message } from "~/types";
import { useStore, useCurrentUser } from "~/store";
import { timeAgo } from "~/utils";
import { useToast } from "~/components/ui";

type InboxTab = "inbox" | "sent";

export default function Inbox() {
  const { state, dispatch } = useStore();
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<InboxTab>("inbox");
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeError, setComposeError] = useState("");

  // Pre-fill "to" from search params
  useEffect(() => {
    const toParam = searchParams.get("to");
    if (toParam) {
      setComposeTo(toParam);
      setShowCompose(true);
    }
  }, [searchParams]);

  // Redirect if not logged in
  useEffect(() => {
    if (!currentUser) {
      navigate("/login", { replace: true });
    }
  }, [currentUser, navigate]);

  // Inbox messages (received), sorted newest first
  const inboxMessages = useMemo(() => {
    if (!currentUser) return [];
    return state.messages
      .filter((m) => m.toId === currentUser.id)
      .toSorted((a, b) => b.createdAt - a.createdAt);
  }, [state.messages, currentUser]);

  // Sent messages, sorted newest first
  const sentMessages = useMemo(() => {
    if (!currentUser) return [];
    return state.messages
      .filter((m) => m.fromId === currentUser.id)
      .toSorted((a, b) => b.createdAt - a.createdAt);
  }, [state.messages, currentUser]);

  const getUsernameById = (userId: string): string => {
    const user = state.users.find((u) => u.id === userId);
    return user?.username ?? "[deleted]";
  };

  const handleToggleMessage = (message: Message) => {
    if (expandedMessageId === message.id) {
      setExpandedMessageId(null);
      setReplyToId(null);
      setReplyBody("");
    } else {
      setExpandedMessageId(message.id);
      setReplyToId(null);
      setReplyBody("");
      // Mark as read if it's an inbox message and unread
      if (currentUser && message.toId === currentUser.id && !message.read) {
        dispatch({ type: "READ_MESSAGE", messageId: message.id });
      }
    }
  };

  const handleReply = (originalMessage: Message) => {
    if (!currentUser || replyBody.trim() === "") return;

    const newMessage: Message = {
      id: crypto.randomUUID(),
      fromId: currentUser.id,
      toId: originalMessage.fromId,
      subject: originalMessage.subject.startsWith("Re: ")
        ? originalMessage.subject
        : `Re: ${originalMessage.subject}`,
      body: replyBody.trim(),
      createdAt: Date.now(),
      read: false,
    };

    dispatch({ type: "SEND_MESSAGE", message: newMessage });
    setReplyToId(null);
    setReplyBody("");
    toast.success("Reply sent!");
  };

  const handleComposeSend = () => {
    if (!currentUser) return;

    const trimmedTo = composeTo.trim();
    const trimmedSubject = composeSubject.trim();
    const trimmedBody = composeBody.trim();

    if (trimmedTo === "") {
      setComposeError("Recipient is required");
      return;
    }

    const recipientUser = state.users.find(
      (u) => u.username.toLowerCase() === trimmedTo.toLowerCase(),
    );
    if (!recipientUser) {
      setComposeError(`User "${trimmedTo}" not found`);
      return;
    }

    if (recipientUser.id === currentUser.id) {
      setComposeError("You cannot send a message to yourself");
      return;
    }

    if (trimmedSubject === "") {
      setComposeError("Subject is required");
      return;
    }

    if (trimmedBody === "") {
      setComposeError("Message body is required");
      return;
    }

    const newMessage: Message = {
      id: crypto.randomUUID(),
      fromId: currentUser.id,
      toId: recipientUser.id,
      subject: trimmedSubject,
      body: trimmedBody,
      createdAt: Date.now(),
      read: false,
    };

    dispatch({ type: "SEND_MESSAGE", message: newMessage });
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeError("");
    setShowCompose(false);
    toast.success("Message sent!");
  };

  if (!currentUser) {
    return null;
  }

  const activeMessages = activeTab === "inbox" ? inboxMessages : sentMessages;
  const unreadCount = inboxMessages.filter((m) => !m.read).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Messages
          {unreadCount > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              ({unreadCount} unread)
            </span>
          )}
        </h1>
        <button
          onClick={() => {
            setShowCompose(!showCompose);
            setComposeError("");
          }}
          className="flex items-center gap-1.5 rounded-full bg-[#ff4500] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#e03d00]"
        >
          <PenSquare size={14} />
          Compose
        </button>
      </div>

      {/* Compose Section */}
      {showCompose && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            New Message
          </h2>

          {composeError !== "" && (
            <div className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {composeError}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="compose-to"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                To
              </label>
              <input
                id="compose-to"
                type="text"
                value={composeTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setComposeTo(e.target.value);
                  setComposeError("");
                }}
                placeholder="Username"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label
                htmlFor="compose-subject"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Subject
              </label>
              <input
                id="compose-subject"
                type="text"
                value={composeSubject}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setComposeSubject(e.target.value);
                  setComposeError("");
                }}
                placeholder="Subject"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label
                htmlFor="compose-body"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Message
              </label>
              <textarea
                id="compose-body"
                value={composeBody}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setComposeBody(e.target.value);
                  setComposeError("");
                }}
                rows={4}
                placeholder="Write your message..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCompose(false);
                  setComposeError("");
                }}
                className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleComposeSend}
                className="flex items-center gap-1.5 rounded-full bg-[#ff4500] px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-[#e03d00]"
              >
                <Send size={14} />
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("inbox")}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "inbox"
              ? "border-[#ff4500] text-[#ff4500]"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          <InboxIcon size={16} />
          Inbox
          {unreadCount > 0 && (
            <span className="rounded-full bg-[#ff4500] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("sent")}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "sent"
              ? "border-[#ff4500] text-[#ff4500]"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          <Send size={16} />
          Sent
        </button>
      </div>

      {/* Messages list */}
      {activeMessages.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activeTab === "inbox" ? "Your inbox is empty." : "You haven't sent any messages yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activeMessages.map((message) => {
            const isExpanded = expandedMessageId === message.id;
            const isInbox = activeTab === "inbox";
            const otherUsername = isInbox
              ? getUsernameById(message.fromId)
              : getUsernameById(message.toId);
            const isUnread = isInbox && !message.read;

            return (
              <div
                key={message.id}
                className={`rounded-lg border bg-white transition-colors dark:bg-gray-800 ${
                  isUnread
                    ? "border-[#0079D3]/40 dark:border-[#4db8ff]/30"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                {/* Message header - clickable */}
                <button
                  onClick={() => handleToggleMessage(message)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {/* Unread indicator */}
                  <div className="flex shrink-0 items-center">
                    {isUnread ? (
                      <Mail size={16} className="text-[#0079D3]" />
                    ) : (
                      <MailOpen size={16} className="text-gray-400 dark:text-gray-500" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm ${
                          isUnread
                            ? "font-bold text-gray-900 dark:text-gray-100"
                            : "font-medium text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {isInbox ? "From" : "To"}:{" "}
                        <Link
                          to={`/u/${otherUsername}`}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          className="text-[#0079D3] hover:underline dark:text-[#4db8ff]"
                        >
                          u/{otherUsername}
                        </Link>
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {timeAgo(message.createdAt)}
                      </span>
                    </div>
                    <p
                      className={`truncate text-sm ${
                        isUnread
                          ? "font-semibold text-gray-900 dark:text-gray-100"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {message.subject}
                    </p>
                    {!isExpanded && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {message.body}
                      </p>
                    )}
                  </div>

                  {/* Expand icon */}
                  <div className="shrink-0 text-gray-400">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
                    <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                      {message.body}
                    </p>

                    {/* Reply button (inbox only) */}
                    {isInbox && (
                      <div className="mt-3">
                        {replyToId === message.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={replyBody}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                setReplyBody(e.target.value)
                              }
                              rows={3}
                              placeholder="Write your reply..."
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#ff4500] focus:ring-1 focus:ring-[#ff4500] focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setReplyToId(null);
                                  setReplyBody("");
                                }}
                                className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleReply(message)}
                                disabled={replyBody.trim() === ""}
                                className="flex items-center gap-1 rounded-full bg-[#ff4500] px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#e03d00] disabled:opacity-50"
                              >
                                <Send size={12} />
                                Send Reply
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setReplyToId(message.id)}
                            className="flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                          >
                            <Reply size={12} />
                            Reply
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
