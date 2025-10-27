import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface LobbyProps {
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
}

export const Lobby = ({ onCreateRoom, onJoinRoom }: LobbyProps) => {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateRoom = () => {
    if (playerName.trim()) {
      onCreateRoom(playerName.trim());
    }
  };

  const handleJoinRoom = () => {
    if (playerName.trim() && roomId.trim()) {
      onJoinRoom(roomId.trim(), playerName.trim());
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold mb-2">3-2-5</CardTitle>
          <CardDescription className="text-lg">
            Teen Do Paanch - Online Multiplayer Card Game
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Name</label>
            <Input
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full"
            />
          </div>

          {!isJoining ? (
            <div className="space-y-4">
              <Button
                onClick={handleCreateRoom}
                disabled={!playerName.trim()}
                className="w-full"
                size="lg"
              >
                Create New Room
              </Button>
              <Button
                onClick={() => setIsJoining(true)}
                variant="secondary"
                className="w-full"
                size="lg"
              >
                Join Existing Room
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Room ID</label>
                <Input
                  placeholder="Enter room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button
                onClick={handleJoinRoom}
                disabled={!playerName.trim() || !roomId.trim()}
                className="w-full"
                size="lg"
              >
                Join Room
              </Button>
              <Button
                onClick={() => setIsJoining(false)}
                variant="outline"
                className="w-full"
              >
                Back
              </Button>
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <h3 className="font-semibold mb-2">How to Play:</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 3 players, 10 cards each</li>
              <li>• Dealer chooses trump after first 5 cards</li>
              <li>• Dealer must win 5 tricks, others 3 and 2</li>
              <li>• Follow suit if possible</li>
              <li>• Trump cards beat all others</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
