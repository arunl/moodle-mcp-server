/**
 * Moodle REST API Client
 * Handles authentication and API calls to Moodle LMS
 * 
 * Supports two authentication methods:
 * 1. Token-based (for Moodle instances with web services enabled)
 * 2. Session-based (for SSO/university Moodle where tokens are disabled)
 */

export interface MoodleConfig {
  baseUrl: string;
  // Token-based auth
  token?: string;
  username?: string;
  password?: string;
  service?: string;
  // Session-based auth (for SSO/university Moodle)
  sessionCookie?: string;  // MoodleSession cookie value
  sessKey?: string;        // Session key from page
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  displayname: string;
  enrolledusercount?: number;
  idnumber: string;
  visible: number;
  summary: string;
  summaryformat: number;
  format: string;
  showgrades: boolean;
  lang: string;
  enablecompletion: boolean;
  completionhascriteria: boolean;
  completionusertracked: boolean;
  category: number;
  progress?: number;
  completed?: boolean;
  startdate: number;
  enddate: number;
  marker: number;
  lastaccess?: number;
  isfavourite: boolean;
  hidden: boolean;
  overviewfiles?: { filename: string; fileurl: string }[];
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  nosubmissions: number;
  submissiondrafts: number;
  sendnotifications: number;
  sendlatenotifications: number;
  sendstudentnotifications: number;
  duedate: number;
  allowsubmissionsfromdate: number;
  grade: number;
  timemodified: number;
  completionsubmit: number;
  cutoffdate: number;
  gradingduedate: number;
  teamsubmission: number;
  requireallteammemberssubmit: number;
  teamsubmissiongroupingid: number;
  blindmarking: number;
  hidegrader: number;
  revealidentities: number;
  attemptreopenmethod: string;
  maxattempts: number;
  markingworkflow: number;
  markingallocation: number;
  requiresubmissionstatement: number;
  preventsubmissionnotingroup: number;
  intro: string;
  introformat: number;
  introfiles: { filename: string; fileurl: string }[];
  introattachments: { filename: string; fileurl: string }[];
}

export interface MoodleGradeItem {
  id: number;
  itemname: string;
  itemtype: string;
  itemmodule: string;
  iteminstance: number;
  itemnumber: number;
  idnumber: string;
  categoryid: number;
  outcomeid: number | null;
  scaleid: number | null;
  locked: boolean;
  cmid: number;
  graderaw?: number;
  gradedatesubmitted?: number;
  gradedategraded?: number;
  gradehiddenbydate: boolean;
  gradeneedsupdate: boolean;
  gradeishidden: boolean;
  gradeislocked: boolean;
  gradeisoverridden: boolean;
  gradeformatted: string;
  grademin: number;
  grademax: number;
  rangeformatted: string;
  percentageformatted: string;
  feedback: string;
  feedbackformat: number;
}

export interface MoodleEvent {
  id: number;
  name: string;
  description: string;
  descriptionformat: number;
  location: string;
  categoryid: number | null;
  groupid: number | null;
  userid: number;
  repeatid: number | null;
  eventcount: number | null;
  component: string;
  modulename: string;
  instance: number;
  eventtype: string;
  timestart: number;
  timeduration: number;
  timesort: number;
  timeusermidnight: number;
  visible: number;
  timemodified: number;
  icon: { key: string; component: string; alttext: string };
  course?: { id: number; fullname: string; shortname: string };
  subscription?: { displayeventsource: boolean };
  canedit: boolean;
  candelete: boolean;
  deleteurl: string;
  editurl: string;
  viewurl: string;
  formattedtime: string;
  isactionevent: boolean;
  iscourseevent: boolean;
  iscategoryevent: boolean;
  groupname: string | null;
  normalisedeventtype: string;
  normalisedeventtypetext: string;
  url: string;
}

export interface MoodleCourseContent {
  id: number;
  name: string;
  visible: number;
  summary: string;
  summaryformat: number;
  section: number;
  hiddenbynumsections: number;
  uservisible: boolean;
  modules: MoodleModule[];
}

export interface MoodleModule {
  id: number;
  url?: string;
  name: string;
  instance: number;
  contextid: number;
  visible: number;
  uservisible: boolean;
  visibleoncoursepage: number;
  modicon: string;
  modname: string;
  modplural: string;
  indent: number;
  onclick: string;
  afterlink: string | null;
  customdata: string;
  noviewlink: boolean;
  completion: number;
  completiondata?: {
    state: number;
    timecompleted: number;
    overrideby: number | null;
    valueused: boolean;
  };
  contents?: MoodleContent[];
}

export interface MoodleContent {
  type: string;
  filename: string;
  filepath: string;
  filesize: number;
  fileurl: string;
  timecreated: number;
  timemodified: number;
  sortorder: number;
  mimetype?: string;
  isexternalfile: boolean;
  userid: number | null;
  author: string | null;
  license: string | null;
}

export interface MoodleUser {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  fullname: string;
  email: string;
  department: string;
  firstaccess: number;
  lastaccess: number;
  auth: string;
  suspended: boolean;
  confirmed: boolean;
  lang: string;
  theme: string;
  timezone: string;
  mailformat: number;
  description: string;
  descriptionformat: number;
  profileimageurlsmall: string;
  profileimageurl: string;
}

export interface MoodleSubmission {
  id: number;
  userid: number;
  attemptnumber: number;
  timecreated: number;
  timemodified: number;
  status: string;
  groupid: number;
  assignment: number;
  latest: number;
  plugins: {
    type: string;
    name: string;
    fileareas?: {
      area: string;
      files: { filename: string; fileurl: string }[];
    }[];
    editorfields?: {
      name: string;
      description: string;
      text: string;
      format: number;
    }[];
  }[];
  gradingstatus: string;
}

export interface MoodleForumDiscussion {
  id: number;
  name: string;
  groupid: number;
  timemodified: number;
  usermodified: number;
  timestart: number;
  timeend: number;
  discussion: number;
  parent: number;
  userid: number;
  created: number;
  modified: number;
  mailed: number;
  subject: string;
  message: string;
  messageformat: number;
  messagetrust: number;
  attachment: string;
  totalscore: number;
  mailnow: number;
  userfullname: string;
  usermodifiedfullname: string;
  userpictureurl: string;
  usermodifiedpictureurl: string;
  numreplies: number;
  numunread: number;
  pinned: boolean;
  locked: boolean;
  starred: boolean;
  canreply: boolean;
  canlock: boolean;
  canfavourite: boolean;
}

export class MoodleClient {
  private baseUrl: string;
  private token: string | null = null;
  private service: string;
  // Session-based auth
  private sessionCookie: string | null = null;
  private sessKey: string | null = null;
  private useSessionAuth: boolean = false;

  constructor(config: MoodleConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.service = config.service || 'moodle_mobile_app';
    
    if (config.token) {
      this.token = config.token;
    }
    
    // Session-based authentication (for SSO/university Moodle)
    if (config.sessionCookie && config.sessKey) {
      this.sessionCookie = config.sessionCookie;
      this.sessKey = config.sessKey;
      this.useSessionAuth = true;
    }
  }

  /**
   * Authenticate with username/password to get a token
   */
  async authenticate(username: string, password: string): Promise<string> {
    const params = new URLSearchParams({
      username,
      password,
      service: this.service,
    });

    const response = await fetch(
      `${this.baseUrl}/login/token.php?${params.toString()}`
    );
    const data = await response.json();

    if (data.error) {
      throw new Error(`Authentication failed: ${data.error}`);
    }

    this.token = data.token;
    return data.token;
  }

  /**
   * Set the token directly (for pre-authenticated tokens)
   */
  setToken(token: string): void {
    this.token = token;
    this.useSessionAuth = false;
  }

  /**
   * Set session-based authentication (for SSO Moodle)
   */
  setSession(sessionCookie: string, sessKey: string): void {
    this.sessionCookie = sessionCookie;
    this.sessKey = sessKey;
    this.useSessionAuth = true;
  }

  /**
   * Check if using session-based authentication
   */
  isSessionAuth(): boolean {
    return this.useSessionAuth;
  }

  /**
   * Make an API call using session-based authentication (internal AJAX API)
   * This is used for Moodle instances where web service tokens are disabled
   */
  async callSession<T>(methodname: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.sessionCookie || !this.sessKey) {
      throw new Error('Session authentication not configured. Please provide sessionCookie and sessKey.');
    }

    const response = await fetch(
      `${this.baseUrl}/lib/ajax/service.php?sesskey=${this.sessKey}&info=${methodname}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `MoodleSessionprod=${this.sessionCookie}`,
        },
        body: JSON.stringify([{
          index: 0,
          methodname,
          args,
        }]),
      }
    );

    const data = await response.json();

    if (Array.isArray(data) && data[0]) {
      if (data[0].error) {
        throw new Error(`Moodle API Error: ${data[0].exception?.message || 'Unknown error'} (${data[0].exception?.errorcode || 'unknown'})`);
      }
      return data[0].data as T;
    }

    throw new Error('Unexpected response format from Moodle');
  }

  /**
   * Make an API call to Moodle (token-based authentication)
   */
  async callToken<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.token) {
      throw new Error('Not authenticated. Please provide a token or call authenticate() first.');
    }

    const formData = new URLSearchParams();
    formData.append('wstoken', this.token);
    formData.append('wsfunction', wsfunction);
    formData.append('moodlewsrestformat', 'json');

    // Flatten nested objects for Moodle's expected format
    const flattenParams = (obj: Record<string, unknown>, prefix = ''): void => {
      for (const [key, value] of Object.entries(obj)) {
        const paramKey = prefix ? `${prefix}[${key}]` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          flattenParams(value as Record<string, unknown>, paramKey);
        } else if (Array.isArray(value)) {
          value.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              flattenParams(item as Record<string, unknown>, `${paramKey}[${index}]`);
            } else {
              formData.append(`${paramKey}[${index}]`, String(item));
            }
          });
        } else {
          formData.append(paramKey, String(value));
        }
      }
    };

    flattenParams(params);

    const response = await fetch(`${this.baseUrl}/webservice/rest/server.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (data.exception) {
      throw new Error(`Moodle API Error: ${data.message} (${data.errorcode})`);
    }

    return data as T;
  }

  /**
   * Make an API call to Moodle (auto-selects auth method)
   */
  async call<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.useSessionAuth) {
      return this.callSession<T>(wsfunction, params);
    }
    return this.callToken<T>(wsfunction, params);
  }

  /**
   * Get site info (also validates the token)
   */
  async getSiteInfo(): Promise<{
    sitename: string;
    username: string;
    firstname: string;
    lastname: string;
    fullname: string;
    userid: number;
    siteurl: string;
    userpictureurl: string;
  }> {
    return this.call('core_webservice_get_site_info');
  }

  /**
   * Get user's enrolled courses
   */
  async getCourses(userid?: number): Promise<MoodleCourse[]> {
    if (!userid) {
      const siteInfo = await this.getSiteInfo();
      userid = siteInfo.userid;
    }
    return this.call('core_enrol_get_users_courses', { userid });
  }

  /**
   * Get course content (sections and modules)
   */
  async getCourseContents(courseid: number): Promise<MoodleCourseContent[]> {
    return this.call('core_course_get_contents', { courseid });
  }

  /**
   * Get assignments for courses
   */
  async getAssignments(courseids: number[]): Promise<{
    courses: { id: number; fullname: string; assignments: MoodleAssignment[] }[];
  }> {
    return this.call('mod_assign_get_assignments', { courseids });
  }

  /**
   * Get user's grades for a course
   */
  async getGrades(courseid: number, userid?: number): Promise<{
    usergrades: {
      courseid: number;
      userid: number;
      userfullname: string;
      maxdepth: number;
      gradeitems: MoodleGradeItem[];
    }[];
  }> {
    if (!userid) {
      const siteInfo = await this.getSiteInfo();
      userid = siteInfo.userid;
    }
    return this.call('gradereport_user_get_grade_items', { courseid, userid });
  }

  /**
   * Get calendar events
   */
  async getCalendarEvents(options: {
    timestart?: number;
    timeend?: number;
    courseids?: number[];
  } = {}): Promise<{ events: MoodleEvent[] }> {
    const now = Math.floor(Date.now() / 1000);
    const events = {
      courseids: options.courseids || [],
    };
    const opts = {
      timestart: options.timestart || now,
      timeend: options.timeend || now + 30 * 24 * 60 * 60, // 30 days from now
      userevents: 1,
      siteevents: 1,
    };
    return this.call('core_calendar_get_calendar_events', { events, options: opts });
  }

  /**
   * Get upcoming events (deadlines, etc.)
   */
  async getUpcomingEvents(courseid?: number): Promise<{ events: MoodleEvent[] }> {
    return this.call('core_calendar_get_action_events_by_timesort', {
      limitnum: 50,
      timesortfrom: Math.floor(Date.now() / 1000),
      courseid: courseid || 0,
    });
  }

  /**
   * Get assignment submission status
   */
  async getAssignmentSubmissionStatus(
    assignid: number,
    userid?: number
  ): Promise<{
    lastattempt?: {
      submission?: MoodleSubmission;
      submissiongroupmemberswhoneedtosubmit?: unknown[];
      submissionsenabled: boolean;
      locked: boolean;
      graded: boolean;
      canedit: boolean;
      caneditowner: boolean;
      cansubmit: boolean;
      extensionduedate: number;
      blindmarking: boolean;
      gradingstatus: string;
      usergroups: unknown[];
    };
    feedback?: {
      grade?: {
        id: number;
        assignment: number;
        userid: number;
        attemptnumber: number;
        timecreated: number;
        timemodified: number;
        grader: number;
        grade: string;
      };
      gradefordisplay?: string;
      gradeddate?: number;
    };
    warnings: unknown[];
  }> {
    const params: Record<string, unknown> = { assignid };
    if (userid) {
      params.userid = userid;
    }
    return this.call('mod_assign_get_submission_status', params);
  }

  /**
   * Get forum discussions
   */
  async getForumDiscussions(
    forumid: number,
    sortby: string = 'timemodified',
    sortdirection: string = 'DESC',
    page: number = 0,
    perpage: number = 10
  ): Promise<{ discussions: MoodleForumDiscussion[] }> {
    return this.call('mod_forum_get_forum_discussions', {
      forumid,
      sortby,
      sortdirection,
      page,
      perpage,
    });
  }

  /**
   * Get user profile
   */
  async getUserProfile(userid?: number): Promise<MoodleUser[]> {
    if (!userid) {
      const siteInfo = await this.getSiteInfo();
      userid = siteInfo.userid;
    }
    return this.call('core_user_get_users_by_field', {
      field: 'id',
      values: [userid],
    });
  }

  /**
   * Get course participants
   */
  async getCourseParticipants(courseid: number): Promise<MoodleUser[]> {
    return this.call('core_enrol_get_enrolled_users', { courseid });
  }

  /**
   * Search courses
   */
  async searchCourses(
    search: string,
    page: number = 0,
    perpage: number = 20
  ): Promise<{ courses: MoodleCourse[]; total: number }> {
    return this.call('core_course_search_courses', {
      criterianame: 'search',
      criteriavalue: search,
      page,
      perpage,
    });
  }

  /**
   * Get notifications
   */
  async getNotifications(
    useridto?: number,
    limit: number = 20
  ): Promise<{
    notifications: {
      id: number;
      useridfrom: number;
      useridto: number;
      subject: string;
      shortenedsubject: string;
      text: string;
      fullmessage: string;
      fullmessageformat: number;
      fullmessagehtml: string;
      smallmessage: string;
      contexturl: string;
      contexturlname: string;
      timecreated: number;
      timecreatedpretty: string;
      timeread: number;
      read: boolean;
      deleted: boolean;
      iconurl: string;
      component: string;
      eventtype: string;
      customdata: string;
    }[];
  }> {
    if (!useridto) {
      const siteInfo = await this.getSiteInfo();
      useridto = siteInfo.userid;
    }
    return this.call('message_popup_get_popup_notifications', {
      useridto,
      limit,
    });
  }

  /**
   * Get unread notification count
   */
  async getUnreadNotificationCount(userid?: number): Promise<number> {
    if (!userid) {
      const siteInfo = await this.getSiteInfo();
      userid = siteInfo.userid;
    }
    const result: { count: number } = await this.call(
      'message_popup_get_unread_popup_notification_count',
      { useridto: userid }
    );
    return result.count;
  }

  /**
   * Get recent course activity
   */
  async getRecentCourseActivity(
    courseid: number,
    since?: number
  ): Promise<unknown> {
    return this.call('core_course_get_recent_courses', {
      courseid,
      since: since || Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60, // Last 7 days
    });
  }

  /**
   * Get file URL with token for downloading
   */
  getFileUrl(fileurl: string): string {
    if (!this.token) {
      return fileurl;
    }
    const separator = fileurl.includes('?') ? '&' : '?';
    return `${fileurl}${separator}token=${this.token}`;
  }
}
