// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract GasOptimizerDemo {
    struct User {
        uint256 score;
        uint64 joinedAt;
        bool active;
        string nickname;
    }

    uint8 public version = 1;
    uint256 public totalScore;
    uint8 public mode = 2;

    address public owner;
    address[] public userList;
    mapping(address => User) public users;
    mapping(address => bool) public whitelist;
    bool public paused;

    event UserAdded(address indexed account, uint256 score);
    event ScoreBumped(address indexed account, uint256 newScore);
    event NicknameUpdated(address indexed account, string nickname);

    constructor() {
        owner = msg.sender;
    }

    function addUsers(
        address[] memory accounts,
        uint256[] memory scores,
        string memory prefix
    ) public {
        require(msg.sender == owner, "Only owner can add users");
        require(!paused, "Contract is paused");
        require(accounts.length == scores.length, "Length mismatch");

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 score = scores[i];

            require(account != address(0), "Invalid account");
            require(users[account].joinedAt == 0, "User already exists");

            userList.push(account);
            users[account] = User({
                score: score,
                joinedAt: uint64(block.timestamp),
                active: true,
                nickname: string(abi.encodePacked(prefix, "_", _toString(i)))
            });

            whitelist[account] = true;
            totalScore += score;

            emit UserAdded(account, score);
        }
    }

    function batchBumpScore(address[] memory accounts, uint256 amount) public {
        require(msg.sender == owner, "Only owner can bump scores");
        require(amount > 0, "Amount must be > 0");

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            require(whitelist[account], "Address not whitelisted");

            users[account].score = users[account].score + amount;
            totalScore = totalScore + amount;

            emit ScoreBumped(account, users[account].score);
        }
    }

    function setNicknames(address[] memory accounts, string[] memory names) public {
        require(msg.sender == owner, "Only owner can set names");
        require(accounts.length == names.length, "Length mismatch");

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            require(users[account].joinedAt != 0, "User does not exist");
            users[account].nickname = names[i];
            emit NicknameUpdated(account, names[i]);
        }
    }

    function setPaused(bool nextPaused) public {
        require(msg.sender == owner, "Only owner can set pause");
        paused = nextPaused;
    }

    function activeScoreTotal() public view returns (uint256 sum) {
        for (uint256 i = 0; i < userList.length; i++) {
            address account = userList[i];
            if (users[account].active) {
                sum += users[account].score;
            }
        }
        return sum;
    }

    function findUsersByPrefix(string memory prefix) public view returns (address[] memory result) {
        uint256 count = 0;

        for (uint256 i = 0; i < userList.length; i++) {
            address account = userList[i];
            if (_startsWith(users[account].nickname, prefix)) {
                count++;
            }
        }

        result = new address[](count);
        uint256 cursor = 0;

        for (uint256 i = 0; i < userList.length; i++) {
            address account = userList[i];
            if (_startsWith(users[account].nickname, prefix)) {
                result[cursor] = account;
                cursor++;
            }
        }
    }

    function _startsWith(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (prefixBytes.length > valueBytes.length) {
            return false;
        }

        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (valueBytes[i] != prefixBytes[i]) {
                return false;
            }
        }
        return true;
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
