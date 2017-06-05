DROP TABLE Review_Question;
DROP TABLE Review_Title;
DROP TABLE Review_Summary;
DROP TABLE Title_Category;
DROP TABLE Message;
DROP TABLE User_Status;
DROP TABLE Group_Status;
DROP TABLE Access_Count;

CREATE TABLE Message (
    id              serial          PRIMARY KEY,
    message         varchar(500)[],
    keyword         varchar(500)[],
    status          int
);

CREATE TABLE Title_Category (
    category_number serial          PRIMARY KEY,
    category        varchar(20)
);

CREATE TABLE Review_Summary (
    id              serial          PRIMARY KEY,
    summary         varchar(200),
    keyword         varchar(500)[],
    title_category  int,
    FOREIGN KEY (title_category) REFERENCES Title_Category (category_number)
);

CREATE TABLE Review_Title (
    id              int          PRIMARY KEY,
    title_category  int,
    title_number    int,
    title           varchar(200),
    FOREIGN KEY (title_category) REFERENCES Title_Category (category_number)
);

CREATE TABLE Review_Question (
    id                  serial          PRIMARY KEY,
    title_id            int,
    question_number     int,
    question            varchar(300),
    FOREIGN KEY (title_id) REFERENCES Review_Title (id)
);

CREATE TABLE Group_Status (
    group_id            varchar(20) PRIMARY KEY,
    group_name          varchar(20),
    status              int,
    stage               int,
    current_summary_id  int,
    current_question    int,
    passing_summary     varchar(200)[],
    passing_question    varchar(800)[],
    reviewer_Group_flg  boolean
);

CREATE TABLE User_Status (
    user_id             varchar(20) PRIMARY KEY,
    user_name           varchar(20),
    status              int,
    stage               int,
    current_summary_id  int,
    current_question    int,
    access_count        int,
    group_id            varchar(20),
    passing_summary     varchar(200)[],
    passing_question    varchar(800)[],
    reviewer_flg        boolean,
    FOREIGN KEY (group_id) REFERENCES Group_Status (group_id)
);

CREATE TABLE Access_Count (
    user_name        VARCHAR(60)     PRIMARY KEY,
    access_count     int
);

