import * as THREE from 'three';
import { scene } from '../scene.js';
import { createBear, updateBear } from '../entities/bear.js';
import { createFish, updateFish } from '../entities/fish.js';
import { initAudio, playSFX, sounds, wireAudioUnlock } from './audio.js';
import { bindUI, updateUIValues, showGameOver, showHUD, showStart, populateUnlocks } from './ui.js';
import { BEARS, FISH, getPlayerProgress, savePlayerProgress } from '../unlocks.js';
import { updateSpawner, resetSpawner } from './fishSpawner.js';

// --- GAME OBJECTS ---
export let bear = null;
let showcaseBear = null;
let showcaseFish = null;
let activeFishes = [];

// --- UI & STATE ---
const { startButton } = bindUI();
let playerProgress = getPlayerProgress();
export let gameState = { current: 'IDLE', score: 0, streak: 1, idleAnimTimer: 0 };
const gravity = new THREE.Vector3(0, -0.05, 0);
let isFirstLoad = true;

function refreshShowcase() {
    console.log('[Verbose] Refreshing showcase scene.');
    if (showcaseBear) { 
        console.log('[Verbose] Removing previous showcase bear.');
        scene.remove(showcaseBear); 
        showcaseBear = null; 
    }
    if (showcaseFish) { 
        console.log('[Verbose] Removing previous showcase fish.');
        if(showcaseFish.parent) showcaseFish.parent.remove(showcaseFish);
        else scene.remove(showcaseFish); 
        showcaseFish = null; 
    }
    // Bear showcase
    console.log('[Verbose] Creating new showcase bear...');
    showcaseBear = createBear(playerProgress.selectedBear);
    showcaseBear.name = 'showcase-bear';
    showcaseBear.userData.isShowcase = true; // Add a flag to identify the showcase bear
    showcaseBear.position.set(0, 4.65, 0.8);
    showcaseBear.rotation.set(0, 0, 0); // Face camera
    scene.add(showcaseBear);
    console.log('[Verbose] Showcase bear created and added to scene.', showcaseBear);

    // Fish showcase
    console.log('[Verbose] Creating new showcase fish...');
    showcaseFish = createFish(scene, 0, playerProgress.selectedFish);
    showcaseFish.name = 'showcase-fish';  
    console.log('[Verbose] Showcase fish created.', showcaseFish);

    // Attach fish to bear's hand
    console.log('[Verbose] Looking for right arm on showcase bear...');
    const rightArmPivot = showcaseBear.getObjectByName('rightArmPivot');
    if (rightArmPivot) {
        console.log('[Verbose] Right arm pivot found! Attaching fish.');
        scene.remove(showcaseFish); // remove from main scene to add to arm
        rightArmPivot.add(showcaseFish);
        showcaseFish.position.set(0.3, -0.7, 0.4); // Adjusted position relative to pivot
        showcaseFish.rotation.set(-Math.PI / 4, Math.PI / 2, Math.PI);
        showcaseFish.scale.set(0.5, 0.5, 0.5);
    } else {
        console.error('[Verbose] Right arm pivot NOT found. Fish not attached.');
        // Fallback position if arm isn't found
        showcaseFish.position.set(2.0, 2.3, -1.5);
    }
    
    console.log('[Verbose] Looking for left arm on showcase bear...');
    const leftArmPivot = showcaseBear.getObjectByName('leftArmPivot');
    if (leftArmPivot) {
        console.log('[Verbose] Left arm pivot found!');
    } else {
        console.error('[Verbose] Left arm pivot NOT found.');
    }

    if (showcaseFish.userData?.velocity) showcaseFish.userData.velocity.set(0, 0, 0);
    if (showcaseFish.userData) showcaseFish.userData.swimAmplitude = 0;
}

function setupStartScreen() {
    gameState.current = 'IDLE';
    scene.children.forEach(child => {
        if (child.name !== 'showcase-bear' && child.userData && !child.userData.isStatic) {
             if(child.name === 'fish' || child.name === 'bear') {
                child.visible = false;
             }
        }
    });

    activeFishes.forEach(f => scene.remove(f));
    activeFishes = [];

    populateUnlocks(playerProgress, (type, id) => {
        if (type === 'bear') playerProgress.selectedBear = id;
        if (type === 'fish') playerProgress.selectedFish = id;
        savePlayerProgress(playerProgress);

        const quickBearName = document.querySelector('#choose-bear span');
        const quickBearImg = document.querySelector('#choose-bear img');
        const quickFishName = document.querySelector('#choose-fish span');
        const quickFishImg = document.querySelector('#choose-fish img');

        const selectedBearInfo = BEARS.find(b => b.id === playerProgress.selectedBear);
        const selectedFishInfo = FISH.find(f => f.id === playerProgress.selectedFish);

        if(quickBearName) quickBearName.textContent = selectedBearInfo.name;
        if(quickBearImg) quickBearImg.src = selectedBearInfo.asset;
        if(quickFishName) quickFishName.textContent = selectedFishInfo.name;
        if(quickFishImg) quickFishImg.src = selectedFishInfo.asset;

        refreshShowcase();
    });
    refreshShowcase();
    showStart(isFirstLoad);
    isFirstLoad = false;
    startButton.innerText = 'START';
}

function startGame() {
    gameState = { current: 'PLAYING', score: 0, streak: 1 };
    if (showcaseBear) { scene.remove(showcaseBear); showcaseBear = null; }
    if (showcaseFish) { 
        if(showcaseFish.parent) showcaseFish.parent.remove(showcaseFish);
        else scene.remove(showcaseFish); 
        showcaseFish = null; 
    }

    if (bear) scene.remove(bear);
    bear = createBear(playerProgress.selectedBear);
    bear.userData.isStatic = false; // Mark game objects
    scene.add(bear);

    bear.position.x = 0;
    updateUIValues({ score: gameState.score, streak: gameState.streak });
    showHUD();
    try { initAudio(); } catch (e) { /* ignore */ }

    activeFishes.forEach(f => scene.remove(f));
    activeFishes = [];
    resetSpawner();
}

function gameOver() {
    gameState.current = 'GAME_OVER';
    document.getElementById('final-score').innerText = gameState.score;

    if (gameState.score > playerProgress.highScore) {
        playerProgress.highScore = gameState.score;
    }
    let newUnlock = false;
    BEARS.forEach(b => {
        if (!playerProgress.unlockedBears.includes(b.id) && b.unlockCondition.type === 'score' && playerProgress.highScore >= b.unlockCondition.value) {
            playerProgress.unlockedBears.push(b.id);
            newUnlock = true;
        }
    });
    FISH.forEach(f => {
        if (!playerProgress.unlockedFish.includes(f.id) && f.unlockCondition.type === 'score' && playerProgress.highScore >= f.unlockCondition.value) {
            playerProgress.unlockedFish.push(f.id);
            newUnlock = true;
        }
    });

    savePlayerProgress(playerProgress);

    showGameOver();
    playSFX(sounds.splash);
    activeFishes.forEach(f => scene.remove(f));
    activeFishes = [];

    setTimeout(() => {
        const goScreen = document.getElementById('game-over-screen');
        if (goScreen) {
            goScreen.classList.add('fade-out');
            const onFadeOut = () => {
                goScreen.removeEventListener('animationend', onFadeOut);
                setupStartScreen();
                startButton.innerText = 'RETRY';
            };
            goScreen.addEventListener('animationend', onFadeOut);
        }
    }, 2000);
}

export function initGame() {
    setupStartScreen();
    startButton.addEventListener('click', startGame);
    wireAudioUnlock(initAudio);
}

export function updateGame() {
    if (gameState.current === 'PLAYING') {
        if (!bear) return;

        updateBear(bear, 0); // Direction is now handled by controls

        updateSpawner(scene, activeFishes, gameState.score, playerProgress);

        const catchZ = -0.8, failZ = -0.4;
        for (let i = activeFishes.length - 1; i >= 0; i--) {
            const f = activeFishes[i];
            updateFish(f);
            if (f.position.z >= catchZ) {
                const withinX = Math.abs(f.position.x - bear.position.x) <= (bear.userData.netWidth || 1) / 2;
                if (withinX) {
                    playSFX(sounds.catch);
                    gameState.score += 10 * gameState.streak;
                    gameState.streak++;
                    updateUIValues({ score: gameState.score, streak: gameState.streak });
                    scene.remove(f); activeFishes.splice(i,1);
                } else if (f.position.z > failZ) {
                    gameState.streak = 1;
                    updateUIValues({ score: gameState.score, streak: gameState.streak });
                    scene.remove(f); activeFishes.splice(i,1);
                    gameOver(); break;
                }
            }
        }
    } else if (gameState.current === 'GAME_OVER') {
        if (bear && bear.position.y > -10) {
            bear.position.add(gravity);
            bear.rotation.z += 0.05;
        }
    } else { // IDLE
        gameState.idleAnimTimer += 0.05;
        if (showcaseBear) {
            // Find the pivot to rotate, not the arm mesh itself
            const rightArmPivot = showcaseBear.getObjectByName('rightArmPivot');
            if (rightArmPivot) {
                const armBob = Math.sin(gameState.idleAnimTimer) * 0.1;
                rightArmPivot.rotation.x = armBob;
            }
        }
    }
}