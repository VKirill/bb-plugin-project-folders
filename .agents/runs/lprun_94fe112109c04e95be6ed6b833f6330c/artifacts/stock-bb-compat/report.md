STATUS: complete

# Stock BB compatibility: SDK engine floor, keepalive opt-in, safe dispatch hook

The plugin declares the SDK version it really needs, never sends paid keepalive turns unless the user turns it on, and its message.dispatch hook can never block users' messages because of an internal error.

Attempt 1 accepted by Lane Pilot BB writer.
