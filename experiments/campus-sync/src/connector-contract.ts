export interface CampusCourseRef {
  externalId: string;
  sessionId?: string;
}

export interface SyncedCourse extends CampusCourseRef {
  title: string;
  section?: string;
  teacher?: string;
  sourceUrl: string;
}

export interface SyncedDocument {
  externalId: string;
  courseExternalId: string;
  name: string;
  kind: 'file' | 'folder';
  path?: string;
  size?: string;
  updatedAt?: string;
  sourceUrl: string;
}

export interface SyncedAssignment {
  externalId: string;
  courseExternalId: string;
  title: string;
  description?: string;
  dueAt?: string;
  sourceUrl: string;
  submissionUrl?: string;
  hasSubmission?: boolean;
}

export interface SyncedAnnouncement {
  externalId: string;
  courseExternalId: string;
  title: string;
  author?: string;
  content?: string;
  updatedAt?: string;
  sourceUrl: string;
}

export type CampusEventSource = 'agenda' | 'assignment';

export interface SyncedEvent {
  externalId?: string;
  courseExternalId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  sourceType: CampusEventSource;
  sourceExternalId?: string;
  sourceUrl?: string;
}

export interface CampusConnector {
  discoverCourses(): Promise<SyncedCourse[]>;

  listDocuments(course: CampusCourseRef): Promise<SyncedDocument[]>;

  listAssignments(course: CampusCourseRef): Promise<SyncedAssignment[]>;

  getAssignment(course: CampusCourseRef, assignmentId: string): Promise<SyncedAssignment>;

  listAnnouncements(course: CampusCourseRef): Promise<SyncedAnnouncement[]>;

  getAnnouncement(course: CampusCourseRef, announcementId: string): Promise<SyncedAnnouncement>;

  listEvents(course: CampusCourseRef): Promise<SyncedEvent[]>;
}
