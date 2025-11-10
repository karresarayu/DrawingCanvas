
Real-Time Collaborative Drawing Canvas


1. Project Overview

This is a real-time multi-user drawing app where several users can draw on the same canvas at once.
Each user can:

Draw freely using brush and eraser
Choose different colors and brush sizes
Undo and redo only their own drawings
See other users’ drawings and cursor movements instantly
The app uses HTML Canvas on the frontend and Node.js with Socket.io on the backend for real-time updates.



2. How Data Flows 
User → (draws something)
   ↓
Frontend (Canvas + JS)
   ↓
Sends stroke data → Backend (Socket.io)
   ↓
Backend saves stroke → Sends to all users
   ↓
All canvases update instantly

Example Flow:

You draw a line.Your browser sends stroke details to the server.The server shares that data with all other users.Everyone sees your stroke immediately.When you undo, only your stroke disappears — everyone’s view updates to match.

3. WebSocket (Socket.io) Events Used

Event	Who   Sends	     Purpose
stroke	User → Server	Sent when a user draws a stroke
history	Server → All	Sends complete canvas state to everyone
undo	User → Server	User wants to undo their last stroke
redo	User → Server	User wants to redo their last undone stroke
cursor	User → Server → All	Sends cursor position so others can see where you draw
clear	User → Server → All	Clears the entire canvas for everyone



4. Undo and Redo Logic 

Each user can only undo or redo their own strokes.
Here’s how the server keeps track:

Data Stored on Server:
actions = [];             // All current strokes on the canvas
allSavedStrokes = {};     // Keeps every stroke ever made (for redo)
userActions = {};         // List of each user's stroke IDs
redoStacks = {};          // List of strokes undone (for redo)

What Happens:

When a user draws —
Their stroke is added to actions and saved under their user ID.

When they undo —
The last stroke they made is removed from actions and placed in redoStacks.

When they redo —
That stroke is moved back into actions.

Server then sends an updated history to everyone so all canvases match.

This ensures everyone sees the same final drawing, but each user can only undo their own work.




5. How We Handle Performance

(Technique)	                          (Why)

Socket.io	                          Fast and reliable for live communication between users
Draw Batching	                      Sends fewer updates per second to reduce lag
Client-Side Drawing	                  The stroke appears instantly before the server confirms it
Cursor Throttling	                  Cursor updates are limited per second for smoother experience
Full Redraw Only When Needed	      Redraws whole canvas only after undo/redo, not every frame



6. Handling Conflicts (When Many Draw Together)


(Situation)                                  (What Happens)

Two people draw at once           	         Each stroke has a unique ID, so they don’t clash
One user undoes while others draw	         Only their strokes are removed
Network delay	                             Socket.io automatically resends missing data
User reconnects	                             Server sends full history to rebuild their canvas
Multiple undos/redos at same time	         Server handles one event at a time to keep everything consistent



7. Why It’s Designed This Way

Easy to Understand – Everything happens through Socket.io events.
Fast – Uses in-memory arrays instead of database queries for live drawing.
Fair – Undo/Redo affects only the user’s own work.
Syncs Automatically – All users’ canvases always match the server’s version.



8. Future Improvements

(Feature)     	             (Description)

Save Drawings	             Store drawings in MongoDB to restore later
Multiple Rooms	             Allow separate drawing spaces for different groups
Mobile Support               Make it work better on touch screens
Export Option	             Save the final drawing as an image
Performance                  Metrics Add FPS or latency display for fun and debugging



9. Tech Summary

Frontend - HTML, CSS, JS, Canvas API	Drawing area, tools, and events
Backend	- Node.js, Express, Socket.io	Handles real-time connections and sync
Database - MongoDB	Stores user accounts (and drawings later)
Transport -	WebSocket (Socket.io)	Real-time message communication



10. Summary

