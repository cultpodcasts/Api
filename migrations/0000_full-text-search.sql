-- Migration number: 0000 	 2023-09-09T17:37:14.102Z
CREATE VIRTUAL TABLE PodcastsText USING fts5(Guid, Name, Publisher);

INSERT INTO PodcastsText
SELECT Guid, Name, Publisher FROM Podcasts;

CREATE VIRTUAL TABLE EpisodesText USING fts5(Guid, Title, Description, YouTube, Spotify, Apple, Subjects);

INSERT INTO EpisodesText
SELECT Guid, Title, Description, YouTube, Spotify, Apple, Subjects FROM Episodes;

